import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/active_workout_state.dart';
import '../api/trainer_assign.dart';
import '../api/trainer_calendar.dart';
import '../api/trainer_client_card.dart';
import '../api/trainer_client_stats.dart';
import '../api/trainer_home.dart';
import '../api/trainer_workouts.dart';
import 'template_edit_screen.dart' show ExerciseSelect;

// ─── Утилиты ───

/// Метки упражнений: повторяющиеся имена нумеруются «Имя 1», «Имя 2»… (по position).
Map<int, String> _exerciseLabels(List<WorkoutExercise> exs) {
  final Map<String, int> total = <String, int>{};
  for (final WorkoutExercise e in exs) {
    total[e.name] = (total[e.name] ?? 0) + 1;
  }
  final Map<String, int> seen = <String, int>{};
  final Map<int, String> out = <int, String>{};
  for (final WorkoutExercise e in <WorkoutExercise>[...exs]..sort((a, b) => a.position - b.position)) {
    if ((total[e.name] ?? 0) > 1) {
      final int n = (seen[e.name] ?? 0) + 1;
      seen[e.name] = n;
      out[e.position] = '${e.name} $n';
    } else {
      out[e.position] = e.name;
    }
  }
  return out;
}

String _plannedText(WorkoutSet s) {
  final List<String> p = <String>[
    if (s.plannedReps != null) '${s.plannedReps}',
    if (s.plannedWeightKg != null) '× ${s.plannedWeightKg} кг',
    if (s.plannedTimeSec != null) '${s.plannedTimeSec} с',
  ];
  return p.isEmpty ? '—' : p.join(' ');
}

String _formatDuration(int totalSec) {
  final int sec = totalSec % 60;
  final int m = totalSec ~/ 60;
  final int h = m ~/ 60;
  final int mm = m % 60;
  String two(int n) => n.toString().padLeft(2, '0');
  return h > 0 ? '$h:${two(mm)}:${two(sec)}' : '$m:${two(sec)}';
}

/// Экран проведения тренировки клиента тренером. Загружает полную тренировку,
/// затем: черновик → план + «Начать»; активная → таймер, чек-лист, отдых,
/// завершение. Зеркало веб ActiveWorkoutPage (тренерский scope).
class ActiveWorkoutScreen extends ConsumerWidget {
  const ActiveWorkoutScreen({super.key, required this.clientId, required this.workoutId});
  final String clientId;
  final String workoutId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<Workout> w =
        ref.watch(trainerWorkoutProvider((clientId: clientId, wid: workoutId)));
    return w.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (Object e, _) => Scaffold(
        appBar: AppBar(),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Text('Не удалось загрузить тренировку'),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => ref.invalidate(
                    trainerWorkoutProvider((clientId: clientId, wid: workoutId))),
                child: const Text('Повторить'),
              ),
            ],
          ),
        ),
      ),
      data: (Workout workout) =>
          _Conductor(clientId: clientId, workout: workout),
    );
  }
}

class _Conductor extends ConsumerStatefulWidget {
  const _Conductor({required this.clientId, required this.workout});
  final String clientId;
  final Workout workout;

  @override
  ConsumerState<_Conductor> createState() => _ConductorState();
}

class _ConductorState extends ConsumerState<_Conductor> {
  late Workout _w = widget.workout;
  bool _busy = false;
  String? _editing; // ключ "pos-idx" редактируемого подхода
  bool _doneExpanded = false;
  bool _demoExpanded = true; // демонстрация следующего подхода (фото/видео)
  Timer? _ticker;
  ({String key, int left})? _rest;
  Timer? _restTimer;
  final AudioPlayer _player = AudioPlayer();
  // Дата исторической записи (excludedFromBalance) — по умолчанию сегодня.
  DateTime _historyDate = DateTime.now();
  // Контроллер флага «экран проведения открыт» — захватываем заранее, чтобы
  // сбросить его ПОСЛЕ dispose (менять провайдер прямо в dispose нельзя — флаг
  // застревал true и FAB пропадал везде).
  late final _onScreenCtrl = ref.read(activeWorkoutOnScreenProvider.notifier);

  String get _clientId => widget.clientId;
  TrainerWorkoutsApi get _api => ref.read(trainerWorkoutsApiProvider);

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_w.status == WorkoutStatus.active) setState(() {});
    });
    // Пока открыт экран проведения — скрываем плавающий FAB; если тренировка
    // уже active — регистрируем её как «идущую» (на случай прямого входа/возврата).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _onScreenCtrl.state = true;
      if (_w.status == WorkoutStatus.active) {
        ref.read(activeWorkoutProvider.notifier).set(_clientId, _w.id, _w.name);
      }
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _restTimer?.cancel();
    _player.dispose();
    // Экран закрыт — снова разрешаем плавающий FAB (если тренировка ещё идёт).
    // Сброс откладываем на следующий кадр: менять провайдер в dispose нельзя,
    // иначе флаг застревает true и FAB не появляется.
    WidgetsBinding.instance.addPostFrameCallback((_) => _onScreenCtrl.state = false);
    super.dispose();
  }

  /// Короткий сигнал таймера отдыха (двойной — по завершении). Только если звук
  /// включён в настройках. Ошибки воспроизведения молча игнорируем.
  Future<void> _beep({bool twice = false}) async {
    if (!ref.read(workoutSoundEnabledProvider)) return;
    try {
      await _player.stop();
      await _player.play(AssetSource('sounds/beep.wav'));
      if (twice) {
        await Future<void>.delayed(const Duration(milliseconds: 200));
        await _player.play(AssetSource('sounds/beep.wav'));
      }
    } catch (_) {
      // звук недоступен — не критично
    }
  }

  int get _elapsed {
    final DateTime? s = _w.startedAt;
    if (s == null) return 0;
    return DateTime.now().difference(s).inSeconds.clamp(0, 1 << 30);
  }

  Future<void> _run(Future<Workout> Function() action, {bool silent = false}) async {
    if (_busy) return;
    setState(() => _busy = true);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      final Workout updated = await action();
      if (!mounted) return;
      setState(() {
        _w = updated;
        _busy = false;
        _editing = null;
      });
      // Пока работаем с идущей тренировкой — держим указатель «идёт тренировка»
      // актуальным (для FAB «Вернуться» после выхода назад), а не только при
      // старте/загрузке.
      if (updated.status == WorkoutStatus.active) {
        ref.read(activeWorkoutProvider.notifier).set(_clientId, updated.id, updated.name);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      if (!silent) m.showSnackBar(const SnackBar(content: Text('Не удалось сохранить изменение')));
    }
  }

  /// Сохранить плановый подход без busy-блокировки (правка полей в черновике),
  /// чтобы не блокировать кнопку «Начать».
  Future<void> _savePlanned(WorkoutExercise ex, WorkoutSet s, Map<String, dynamic> body) async {
    try {
      final Workout updated = await _api.updateSet(_clientId, _w.id, ex.position, s.setIndex, body);
      if (mounted) setState(() => _w = updated);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Не удалось сохранить изменение')));
      }
    }
  }

  void _startRest(WorkoutExercise ex, WorkoutSet s) {
    final num? rest = s.plannedRestSec;
    if (rest == null || rest <= 0) return;
    _restTimer?.cancel();
    setState(() => _rest = (key: '${ex.position}-${s.setIndex}', left: rest.toInt()));
    _restTimer = Timer.periodic(const Duration(seconds: 1), (Timer t) {
      if (!mounted) return;
      final int left = (_rest?.left ?? 1) - 1;
      if (left <= 0) {
        t.cancel();
        setState(() => _rest = null);
        _beep(twice: true); // отдых закончен → двойной сигнал
        HapticFeedback.mediumImpact();
      } else {
        if (left == 10) {
          _beep(); // за 10 с до конца → короткий сигнал
          HapticFeedback.lightImpact();
        }
        setState(() => _rest = (key: _rest!.key, left: left));
      }
    });
  }

  void _skipRest() {
    _restTimer?.cancel();
    setState(() => _rest = null);
  }

  Future<void> _addExercise() async {
    // Тот же богатый мультивыбор «Выбор упражнений», что и в сборке тренировки:
    // группа→подгруппа, инфо-карточка, счётчики. Каждое выбранное добавляем N раз.
    final NavigatorState nav = Navigator.of(context);
    await nav.push<void>(MaterialPageRoute<void>(
      builder: (BuildContext ctx) => ExerciseSelect(
        initialCounts: const <String, int>{},
        onCancel: () => Navigator.of(ctx).pop(),
        onDone: (Map<String, int> counts, List<TExercise> catalog) async {
          Navigator.of(ctx).pop();
          for (final TExercise ex in catalog) {
            final int n = counts[ex.id] ?? 0;
            for (int i = 0; i < n; i++) {
              await _run(() => _api.addExercise(_clientId, _w.id, ex));
            }
          }
        },
      ),
    ));
  }

  /// Краткая карточка упражнения из каталога (по тапу на «i»).
  void _showExerciseInfo(String exerciseId) {
    final List<TExercise> catalog = ref.read(trainerCatalogProvider).valueOrNull ?? <TExercise>[];
    final TExercise? ex = catalog.where((TExercise e) => e.id == exerciseId).firstOrNull;
    if (ex == null) return;
    final String base = ref.read(baseUrlProvider);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: context.colors.bg,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (BuildContext ctx) {
        final AppColors c = ctx.colors;
        return Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.of(ctx).viewPadding.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(ex.name, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: c.ink)),
              const SizedBox(height: 2),
              Text(
                <String>[
                  if (ex.category.isNotEmpty) ex.category,
                  if (ex.subgroup?.isNotEmpty == true) ex.subgroup!,
                ].join(' · '),
                style: TextStyle(fontSize: 13, color: c.inkMuted),
              ),
              const SizedBox(height: 12),
              CatalogMediaView(
                imageUrl: catalogMediaUrl(base, ex.imageUrl ?? ex.thumbUrl),
                videoUrl: catalogMediaUrl(base, ex.videoUrl),
                height: 200,
                showToggle: true,
              ),
              if (ex.equipment?.isNotEmpty == true) ...<Widget>[
                const SizedBox(height: 12),
                _InfoRow(label: 'Оборудование', value: ex.equipment!),
              ],
              if (ex.primaryMuscles?.isNotEmpty == true) ...<Widget>[
                const SizedBox(height: 8),
                _InfoRow(label: 'Мышцы', value: ex.primaryMuscles!),
              ],
              if (ex.description?.isNotEmpty == true) ...<Widget>[
                const SizedBox(height: 8),
                _InfoRow(label: 'Техника', value: ex.description!),
              ],
            ],
          ),
        );
      },
    );
  }

  Future<void> _toggleDone(WorkoutExercise ex, WorkoutSet s) async {
    final bool next = !s.done;
    final Map<String, dynamic> body = <String, dynamic>{'done': next};
    if (next && !s.hasFact) {
      if (s.plannedReps != null) body['actualReps'] = s.plannedReps;
      if (s.plannedWeightKg != null) body['actualWeightKg'] = s.plannedWeightKg;
      if (s.plannedTimeSec != null) body['actualTimeSec'] = s.plannedTimeSec;
    }
    await _run(() => _api.updateSet(_clientId, _w.id, ex.position, s.setIndex, body));
    if (next) _startRest(ex, s);
  }

  /// Начать тренировку → active, и зарегистрировать её как «идущую» для FAB.
  Future<void> _start() async {
    await _run(() => _api.start(_clientId, _w.id));
    if (!mounted || _w.status != WorkoutStatus.active) return;
    ref.read(activeWorkoutProvider.notifier).set(_clientId, _w.id, _w.name);
    // Главная и карточка клиента должны сразу отразить идущую тренировку
    // (блок «Вернуться к тренировке» / «ближайшая»), иначе остаются на кэше и
    // предлагают «назначить новую». Инвалидируем — как при завершении.
    ref.invalidate(trainerHomeProvider);
    ref.invalidate(clientWorkoutsCardProvider(_clientId));
    ref.invalidate(clientWorkoutsRawProvider(_clientId));
  }

  Future<void> _complete() async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Завершить тренировку?'),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Завершить')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final int el = _elapsed;
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    final NavigatorState nav = Navigator.of(context);
    setState(() => _busy = true);
    try {
      await _api.complete(_clientId, _w.id, durationSec: el > 0 ? el : null);
      ref.read(activeWorkoutProvider.notifier).clear(); // тренировка завершена → убрать FAB
      ref.invalidate(clientWorkoutsCardProvider(_clientId));
      // Бэкенд при завершении отметил занятие проведённым (reconcileFromWorkout) →
      // обновляем тренерский календарь, иначе он остаётся на старом статусе.
      ref.invalidate(trainerSessionsProvider);
      // Прогресс/обзор по упражнениям учитывают завершённую тренировку.
      ref.invalidate(clientWorkoutsRawProvider(_clientId));
      if (!mounted) return;
      nav.pop();
      m.showSnackBar(const SnackBar(content: Text('Тренировка завершена')));
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось завершить тренировку')));
    }
  }

  /// YYYY-MM-DD для backend add-to-history.
  String _isoDate(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  /// Выбрать дату исторической записи (по умолчанию сегодня; не позже сегодня).
  Future<void> _pickHistoryDate() async {
    final DateTime now = DateTime.now();
    final DateTime? d = await showDatePicker(
      context: context,
      initialDate: _historyDate,
      firstDate: DateTime(now.year - 5),
      lastDate: now,
    );
    if (d != null) setState(() => _historyDate = d);
  }

  /// Зафиксировать историческую (excludedFromBalance) тренировку выбранной датой.
  Future<void> _addToHistory() async {
    if (_busy) return;
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    final NavigatorState nav = Navigator.of(context);
    setState(() => _busy = true);
    try {
      await _api.addToHistory(_clientId, _w.id, _isoDate(_historyDate));
      ref.invalidate(clientWorkoutsCardProvider(_clientId));
      // raw каскадно обновит и сводку, и обзор по упражнениям в «Прогрессе».
      ref.invalidate(clientWorkoutsRawProvider(_clientId));
      if (!mounted) return;
      nav.pop();
      m.showSnackBar(const SnackBar(content: Text('Добавлено в историю')));
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось добавить в историю')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_w.name)),
      body: _w.status == WorkoutStatus.draft ? _buildDraft(context) : _buildActive(context),
    );
  }

  // ─────────── Черновик ───────────
  Widget _buildDraft(BuildContext context) {
    final AppColors c = context.colors;
    final Map<int, String> labels = _exerciseLabels(_w.exercises);
    final List<WorkoutExercise> exs = <WorkoutExercise>[..._w.exercises]
      ..sort((a, b) => a.position - b.position);

    return Column(
      children: <Widget>[
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
            children: <Widget>[
              Text('План тренировки. Нажмите «Начать», чтобы провести с клиентом.',
                  style: TextStyle(fontSize: 13, color: c.inkMuted)),
              const SizedBox(height: 12),
              ReorderableListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                buildDefaultDragHandles: false,
                itemCount: exs.length,
                onReorderItem: (int oldI, int newI) {
                  final List<int> order = exs.map((WorkoutExercise e) => e.position).toList();
                  final int moved = order.removeAt(oldI);
                  order.insert(newI, moved);
                  _run(() => _api.reorderExercises(_clientId, _w.id, order));
                },
                itemBuilder: (BuildContext ctx, int i) {
                  final WorkoutExercise ex = exs[i];
                  final WorkoutSet? first = ex.sets.isNotEmpty ? ex.sets.first : null;
                  return _DraftPositionCard(
                    key: ValueKey<int>(ex.position),
                    index: i + 1,
                    listIndex: i,
                    title: labels[ex.position] ?? ex.name,
                    set: first,
                    onSave: first == null
                        ? (_) {}
                        : (Map<String, dynamic> body) => _savePlanned(ex, first, body),
                    onInfo: () => _showExerciseInfo(ex.exerciseId),
                    onRemove: () => _run(() => _api.removeExercise(_clientId, _w.id, ex.position)),
                  );
                },
              ),
              const SizedBox(height: 8),
              _AddExerciseButton(onTap: _busy ? null : _addExercise),
            ],
          ),
        ),
        SafeArea(
          minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: _w.excludedFromBalance
              // Историческая запись: выбор даты + «Добавить в историю» (вместо «Начать»).
              ? Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    InkWell(
                      onTap: _busy ? null : _pickHistoryDate,
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                          color: c.card,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: c.line),
                        ),
                        child: Row(
                          children: <Widget>[
                            Icon(Icons.event_outlined, size: 18, color: c.inkMuted),
                            const SizedBox(width: 10),
                            Text('Дата', style: TextStyle(fontSize: 14, color: c.inkMuted)),
                            const Spacer(),
                            Text(_isoDate(_historyDate),
                                style: AppFonts.mono(size: 14, color: c.ink, weight: FontWeight.w600)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    FilledButton(
                      onPressed: (_busy || exs.isEmpty) ? null : _addToHistory,
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                      child: Text(exs.isEmpty ? 'Добавьте упражнение' : 'Добавить в историю'),
                    ),
                  ],
                )
              : FilledButton(
                  onPressed: (_busy || exs.isEmpty) ? null : _start,
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                  child: Text(exs.isEmpty ? 'Добавьте упражнение' : 'Начать тренировку'),
                ),
        ),
      ],
    );
  }

  // ─────────── Активная ───────────
  Widget _buildActive(BuildContext context) {
    final AppColors c = context.colors;
    final Map<int, String> labels = _exerciseLabels(_w.exercises);
    final List<WorkoutSet> allSets =
        _w.exercises.expand((WorkoutExercise e) => e.sets).toList();
    final int doneCount = allSets.where((WorkoutSet s) => s.done).length;
    final int totalCount = allSets.length;
    bool isDoneEx(WorkoutExercise e) => e.sets.isNotEmpty && e.sets.every((WorkoutSet s) => s.done);
    final List<WorkoutExercise> completed = _w.exercises.where(isDoneEx).toList()
      ..sort((a, b) => a.position - b.position);
    final List<WorkoutExercise> pending = (_w.exercises.where((WorkoutExercise e) => !isDoneEx(e)).toList())
      ..sort((a, b) => a.position - b.position);

    // Демонстрация следующего подхода: медиа первого незавершённого упражнения.
    final WorkoutExercise? nextEx = pending.isEmpty ? null : pending.first;
    final TExercise? nextData = nextEx == null
        ? null
        : (ref.watch(trainerCatalogProvider).valueOrNull ?? const <TExercise>[])
            .where((TExercise e) => e.id == nextEx.exerciseId)
            .firstOrNull;
    final String base = ref.read(baseUrlProvider);
    final String? nextImg =
        nextData == null ? null : catalogMediaUrl(base, nextData.imageUrl ?? nextData.thumbUrl);
    final String? nextVid = nextData == null ? null : catalogMediaUrl(base, nextData.videoUrl);
    final bool nextHasMedia =
        (nextImg != null && nextImg.isNotEmpty) || (nextVid != null && nextVid.isNotEmpty);
    final WorkoutSet? nextSet = nextEx?.sets.where((WorkoutSet s) => !s.done).firstOrNull;
    final String nextPlan = nextSet != null ? _plannedText(nextSet) : '';

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: <Widget>[
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(color: c.accent, borderRadius: BorderRadius.circular(18)),
          child: Row(
            children: <Widget>[
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text('ПРОШЛО',
                      style: AppFonts.mono(size: 10, color: c.accentOn.withValues(alpha: 0.7))),
                  Text(_formatDuration(_elapsed),
                      style: TextStyle(
                          fontSize: 24, fontWeight: FontWeight.bold, color: c.accentOn)),
                ],
              ),
              const Spacer(),
              if (_rest != null)
                _RestPill(left: _rest!.left, onSkip: _skipRest, color: c.accentOn)
              // «Готово» — отметить текущий (следующий невыполненный) подход выполненным.
              else if (nextSet != null)
                GestureDetector(
                  onTap: _busy ? null : () => _toggleDone(nextEx!, nextSet),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
                    decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(20)),
                    child: Text('Готово',
                        style: TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w600, color: c.accentOn)),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        // Демонстрация следующего подхода: имя + план + фото/видео (как в вебе).
        if (nextEx != null && nextHasMedia) ...<Widget>[
          Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            // Отдых идёт → обычный фон; отдых закончен (готов к подходу) → акцент.
            decoration: BoxDecoration(
                color: _rest == null ? c.accent : c.card, borderRadius: BorderRadius.circular(16)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => setState(() => _demoExpanded = !_demoExpanded),
                  child: Row(
                    children: <Widget>[
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text('СЛЕДУЮЩЕЕ УПРАЖНЕНИЕ',
                                style: AppFonts.mono(
                                    size: 10,
                                    color: _rest == null
                                        ? c.accentOn.withValues(alpha: 0.7)
                                        : c.inkMutedXl,
                                    weight: FontWeight.w700)),
                            const SizedBox(height: 2),
                            Text(
                              <String>[
                                labels[nextEx.position] ?? nextEx.name,
                                if (nextPlan.isNotEmpty && nextPlan != '—') nextPlan,
                              ].join(' · '),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.bold,
                                  color: _rest == null ? c.accentOn : c.ink),
                            ),
                          ],
                        ),
                      ),
                      Icon(_demoExpanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                          color: _rest == null ? c.accentOn : c.inkMuted),
                    ],
                  ),
                ),
                if (_demoExpanded) ...<Widget>[
                  const SizedBox(height: 10),
                  CatalogMediaView(
                    imageUrl: nextImg,
                    videoUrl: nextVid,
                    height: 200,
                    showToggle: true,
                    title: '',
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
        GestureDetector(
          onTap: () => setState(() => _doneExpanded = !_doneExpanded),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
            child: Row(
              children: <Widget>[
                Text('ЗАВЕРШЕНО · ${completed.length}',
                    style: AppFonts.mono(size: 13, color: c.inkMuted)),
                const Spacer(),
                Text('$doneCount / $totalCount',
                    style: AppFonts.mono(size: 13, color: c.ink)),
                const SizedBox(width: 4),
                Text('подходов',
                    style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w500)),
                const SizedBox(width: 6),
                Icon(_doneExpanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                    size: 18, color: c.inkMuted),
              ],
            ),
          ),
        ),
        if (_doneExpanded)
          ...completed.map((WorkoutExercise ex) => Opacity(
                opacity: 0.8,
                child: _ExerciseCard(
                  title: labels[ex.position] ?? ex.name,
                  child: Column(children: ex.sets.map((WorkoutSet s) => _activeSetRow(ex, s)).toList()),
                ),
              )),
        const SizedBox(height: 4),
        // Незавершённые: карточки с drag-handle для перестановки (как в плане).
        ReorderableListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          buildDefaultDragHandles: false,
          itemCount: pending.length,
          onReorderItem: (int oldI, int newI) {
            final List<int> pend = pending.map((WorkoutExercise e) => e.position).toList();
            final int moved = pend.removeAt(oldI);
            pend.insert(newI, moved);
            final List<int> order = <int>[
              ...completed.map((WorkoutExercise e) => e.position),
              ...pend,
            ];
            _run(() => _api.reorderExercises(_clientId, _w.id, order));
          },
          itemBuilder: (BuildContext ctx, int i) {
            final WorkoutExercise ex = pending[i];
            final bool editingThis =
                ex.sets.any((WorkoutSet s) => _editing == '${ex.position}-${s.setIndex}');
            return _ActiveExerciseCard(
              key: ValueKey<int>(ex.position),
              listIndex: i,
              title: labels[ex.position] ?? ex.name,
              onDelete: editingThis
                  ? () => _run(() => _api.removeExercise(_clientId, _w.id, ex.position))
                  : null,
              child: Column(children: ex.sets.map((WorkoutSet s) => _activeSetRow(ex, s)).toList()),
            );
          },
        ),
        const SizedBox(height: 8),
        _AddExerciseButton(onTap: _busy ? null : _addExercise),
        if (_w.exercises.isNotEmpty) ...<Widget>[
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _complete,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
            child: const Text('Завершить тренировку'),
          ),
        ],
      ],
    );
  }

  Widget _activeSetRow(WorkoutExercise ex, WorkoutSet s) {
    final AppColors c = context.colors;
    final String key = '${ex.position}-${s.setIndex}';
    if (_editing == key) {
      return _SetEditor(
        set: s,
        onCancel: () => setState(() => _editing = null),
        onSave: (Map<String, dynamic> body) async {
          body['done'] = true;
          await _run(() => _api.updateSet(_clientId, _w.id, ex.position, s.setIndex, body));
          // Отдых мог измениться в редакторе — берём свежий подход из обновлённой
          // тренировки, чтобы таймер запустился с новым значением.
          final WorkoutExercise? freshEx =
              _w.exercises.where((WorkoutExercise e) => e.position == ex.position).firstOrNull;
          final WorkoutSet? freshSet =
              freshEx?.sets.where((WorkoutSet x) => x.setIndex == s.setIndex).firstOrNull;
          if (freshEx != null && freshSet != null) _startRest(freshEx, freshSet);
        },
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: <Widget>[
          Expanded(
            child: _SetMetrics(set: s, showActual: s.hasFact || s.done),
          ),
          _CircleBtn(
            icon: Icons.edit,
            onTap: () => setState(() => _editing = key),
            bg: c.cardElevated,
            fg: c.inkMuted,
          ),
          const SizedBox(width: 8),
          _CircleBtn(
            icon: Icons.check,
            onTap: () => _toggleDone(ex, s),
            bg: s.done ? c.accent : c.cardElevated,
            fg: s.done ? c.accentOn : c.inkMuted,
          ),
        ],
      ),
    );
  }
}

// ─── Карточка упражнения активной тренировки ───
/// Раскладка: [drag-handle] → название → подходы (метрики + кнопки управления).
class _ActiveExerciseCard extends StatelessWidget {
  const _ActiveExerciseCard({
    super.key,
    required this.title,
    required this.listIndex,
    required this.child,
    this.onDelete,
  });
  final String title;
  final int listIndex;
  final Widget child;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(10, 10, 14, 10),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              ReorderableDragStartListener(
                index: listIndex,
                child: Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: Icon(Icons.drag_indicator, size: 20, color: c.inkMutedXl),
                ),
              ),
              Expanded(
                child: Text(title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
              ),
              // Корзина на уровне названия — видна при редактировании упражнения.
              if (onDelete != null)
                GestureDetector(
                  onTap: () async {
                    if (await confirmDelete(context, title: 'Удалить упражнение?')) onDelete!();
                  },
                  child: Padding(
                    padding: const EdgeInsets.only(left: 6),
                    child: Icon(Icons.delete_outline, size: 18, color: c.danger),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Padding(padding: const EdgeInsets.only(left: 26), child: child),
        ],
      ),
    );
  }
}

/// Метрики подхода иконками как в базе знаний: повторы/вес/время/отдых.
class _SetMetrics extends StatelessWidget {
  const _SetMetrics({required this.set, this.showActual = false});
  final WorkoutSet set;
  final bool showActual;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final num? reps = showActual ? (set.actualReps ?? set.plannedReps) : set.plannedReps;
    final num? weight = showActual ? (set.actualWeightKg ?? set.plannedWeightKg) : set.plannedWeightKg;
    final num? time = showActual ? (set.actualTimeSec ?? set.plannedTimeSec) : set.plannedTimeSec;
    final num? rest = set.plannedRestSec;

    Widget metric(IconData icon, num? v) => Padding(
          padding: const EdgeInsets.only(right: 14),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(icon, size: 15, color: c.inkMutedXl),
              const SizedBox(width: 4),
              Text('${(v ?? 0).toInt()}',
                  style: AppFonts.mono(size: 15, color: c.inkMuted, weight: FontWeight.w600)),
            ],
          ),
        );

    return Row(
      children: <Widget>[
        metric(Icons.repeat, reps),
        metric(Icons.fitness_center, weight),
        metric(Icons.timer_outlined, time),
        metric(Icons.bedtime_outlined, rest),
      ],
    );
  }
}

// ─── Карточка позиции черновика (как в редакторе шаблона) ───
/// Все 4 поля плана (повторы/вес/время/отдых) + drag/info/удаление.
/// Поля сохраняются при потере фокуса группы и по «готово» на клавиатуре.
class _DraftPositionCard extends StatefulWidget {
  const _DraftPositionCard({
    super.key,
    required this.index,
    required this.listIndex,
    required this.title,
    required this.set,
    required this.onSave,
    required this.onInfo,
    required this.onRemove,
  });
  final int index;
  final int listIndex;
  final String title;
  final WorkoutSet? set;
  final void Function(Map<String, dynamic> body) onSave;
  final VoidCallback onInfo;
  final VoidCallback onRemove;

  @override
  State<_DraftPositionCard> createState() => _DraftPositionCardState();
}

class _DraftPositionCardState extends State<_DraftPositionCard> {
  late final TextEditingController _reps;
  late final TextEditingController _weight;
  late final TextEditingController _time;
  late final TextEditingController _rest;

  @override
  void initState() {
    super.initState();
    final WorkoutSet? s = widget.set;
    _reps = TextEditingController(text: s?.plannedReps?.toString() ?? '');
    _weight = TextEditingController(text: s?.plannedWeightKg?.toString() ?? '');
    _time = TextEditingController(text: s?.plannedTimeSec?.toString() ?? '');
    _rest = TextEditingController(text: s?.plannedRestSec?.toString() ?? '');
  }

  @override
  void dispose() {
    _reps.dispose();
    _weight.dispose();
    _time.dispose();
    _rest.dispose();
    super.dispose();
  }

  num? _n(String s) => num.tryParse(s.trim().replaceAll(',', '.'));

  void _persist() {
    if (widget.set == null) return;
    widget.onSave(<String, dynamic>{
      'plannedReps': _n(_reps.text),
      'plannedWeightKg': _n(_weight.text),
      'plannedTimeSec': _n(_time.text),
      'plannedRestSec': _n(_rest.text),
    });
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              ReorderableDragStartListener(
                index: widget.listIndex,
                child: Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Icon(Icons.drag_indicator, size: 20, color: c.inkMutedXl),
                ),
              ),
              Expanded(
                child: Text('${widget.index}. ${widget.title}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
              ),
              GestureDetector(
                onTap: widget.onInfo,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  child: Icon(Icons.info_outline, size: 18, color: c.inkMuted),
                ),
              ),
              GestureDetector(
                onTap: () async {
                  if (await confirmDelete(context, title: 'Удалить упражнение?')) widget.onRemove();
                },
                child: Padding(
                  padding: const EdgeInsets.only(left: 2),
                  child: Icon(Icons.delete_outline, size: 18, color: c.inkMuted),
                ),
              ),
            ],
          ),
          if (widget.set != null) ...<Widget>[
            const SizedBox(height: 8),
            Focus(
              onFocusChange: (bool hasFocus) {
                if (!hasFocus) _persist();
              },
              child: Row(
                children: <Widget>[
                  _NumField(label: 'Повторы', ctrl: _reps, onSubmitted: (_) => _persist()),
                  const SizedBox(width: 8),
                  _NumField(label: 'Вес, кг', ctrl: _weight, onSubmitted: (_) => _persist()),
                  const SizedBox(width: 8),
                  _NumField(label: 'Время, с', ctrl: _time, onSubmitted: (_) => _persist()),
                  const SizedBox(width: 8),
                  _NumField(label: 'Отдых, с', ctrl: _rest, onSubmitted: (_) => _persist()),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(label.toUpperCase(),
            style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w600)),
        const SizedBox(height: 2),
        Text(value, style: TextStyle(fontSize: 14, color: c.ink, height: 1.35)),
      ],
    );
  }
}

// ─── Карточка завершённого упражнения (активная тренировка) ───
class _ExerciseCard extends StatelessWidget {
  const _ExerciseCard({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
          const SizedBox(height: 2),
          child,
        ],
      ),
    );
  }
}

class _CircleBtn extends StatelessWidget {
  const _CircleBtn({required this.icon, required this.onTap, required this.bg, required this.fg});
  final IconData icon;
  final VoidCallback onTap;
  final Color bg;
  final Color fg;
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
          child: Icon(icon, size: 18, color: fg),
        ),
      );
}

class _AddExerciseButton extends StatelessWidget {
  const _AddExerciseButton({required this.onTap});
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 13),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: c.line, width: 2),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Icon(Icons.add, size: 16, color: c.inkMuted),
            const SizedBox(width: 6),
            Text('Добавить упражнение',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.inkMuted)),
          ],
        ),
      ),
    );
  }
}

// ─── Таймер отдыха (пилюля) ───
class _RestPill extends StatelessWidget {
  const _RestPill({required this.left, required this.onSkip, required this.color});
  final int left;
  final VoidCallback onSkip;
  final Color color;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text('$left', style: AppFonts.mono(size: 14, color: color)),
          const SizedBox(width: 6),
          Text('Отдых', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: color)),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: onSkip,
            child: Icon(Icons.close, size: 18, color: color),
          ),
        ],
      ),
    );
  }
}

// ─── Редактор подхода-факта (активная тренировка) ───
class _SetEditor extends StatefulWidget {
  const _SetEditor({
    required this.set,
    required this.onCancel,
    required this.onSave,
  });
  final WorkoutSet set;
  final VoidCallback onCancel;
  final void Function(Map<String, dynamic>) onSave;

  @override
  State<_SetEditor> createState() => _SetEditorState();
}

class _SetEditorState extends State<_SetEditor> {
  late final TextEditingController _reps;
  late final TextEditingController _weight;
  late final TextEditingController _time;
  late final TextEditingController _rest;

  @override
  void initState() {
    super.initState();
    final WorkoutSet s = widget.set;
    _reps = TextEditingController(text: (s.actualReps ?? s.plannedReps)?.toString() ?? '');
    _weight = TextEditingController(text: (s.actualWeightKg ?? s.plannedWeightKg)?.toString() ?? '');
    _time = TextEditingController(text: (s.actualTimeSec ?? s.plannedTimeSec)?.toString() ?? '');
    _rest = TextEditingController(text: s.plannedRestSec?.toString() ?? '');
  }

  @override
  void dispose() {
    _reps.dispose();
    _weight.dispose();
    _time.dispose();
    _rest.dispose();
    super.dispose();
  }

  num? _num(String s) => num.tryParse(s.trim().replaceAll(',', '.'));

  void _save() {
    widget.onSave(<String, dynamic>{
      'actualReps': _num(_reps.text),
      'actualWeightKg': _num(_weight.text),
      'actualTimeSec': _num(_time.text),
      'plannedRestSec': _num(_rest.text),
    });
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        children: <Widget>[
          Row(
            children: <Widget>[
              _NumField(label: 'Повторы', ctrl: _reps),
              const SizedBox(width: 8),
              _NumField(label: 'Вес, кг', ctrl: _weight),
              const SizedBox(width: 8),
              _NumField(label: 'Время, с', ctrl: _time),
              const SizedBox(width: 8),
              _NumField(label: 'Отдых, с', ctrl: _rest),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: <Widget>[
              _CircleBtn(icon: Icons.check, onTap: _save, bg: c.accent, fg: c.accentOn),
              const SizedBox(width: 8),
              _CircleBtn(icon: Icons.close, onTap: widget.onCancel, bg: c.cardElevated, fg: c.inkMuted),
            ],
          ),
        ],
      ),
    );
  }
}

class _NumField extends StatelessWidget {
  const _NumField({required this.label, required this.ctrl, this.onSubmitted});
  final String label;
  final TextEditingController ctrl;
  final ValueChanged<String>? onSubmitted;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(label.toUpperCase(), style: AppFonts.mono(size: 10, color: c.inkMuted, weight: FontWeight.w500)),
          const SizedBox(height: 4),
          SizedBox(
            height: 40,
            child: SelectAllTextField(
              controller: ctrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
              textAlign: TextAlign.center,
              textInputAction: TextInputAction.done,
              onSubmitted: onSubmitted,
              style: AppFonts.mono(size: 15, color: c.ink, weight: FontWeight.w500),
              decoration: InputDecoration(
                isDense: true,
                filled: true,
                fillColor: c.chip,
                contentPadding: const EdgeInsets.symmetric(vertical: 8),
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.line)),
                enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.line)),
                focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.accent)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
