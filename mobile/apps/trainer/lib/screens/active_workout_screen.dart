import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../api/active_workout_state.dart';
import '../api/local_workout.dart';
import '../api/offline_providers.dart';
import '../api/trainer_assign.dart';
import '../api/trainer_calendar.dart';
import '../api/trainer_client_card.dart';
import '../api/trainer_client_stats.dart';
import '../api/trainer_clients.dart';
import '../api/trainer_home.dart';
import '../api/trainer_workouts.dart';
import '../widgets/no_connection_view.dart';
import 'support_chat_screen.dart';
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

/// Группа подходов одного упражнения: соседние (по возрастанию position)
/// `WorkoutExercise` с одинаковым `exerciseId` склеены в один блок — их подходы
/// идут подряд и нумеруются сквозно (без «Название 1/2/3»).
class _ExGroup {
  _ExGroup(this.exerciseId, this.title, this.positions, this.sets);
  final String exerciseId;
  final String title;
  final List<int> positions;
  final List<({int pos, WorkoutSet set})> sets;
  int get doneCount => sets.where((({int pos, WorkoutSet set}) e) => e.set.done).length;
}

/// Склеивает соседние (по position) упражнения с одинаковым exerciseId в один блок.
List<_ExGroup> _groupExercises(List<WorkoutExercise> exs) {
  final List<WorkoutExercise> sorted = <WorkoutExercise>[...exs]
    ..sort((WorkoutExercise a, WorkoutExercise b) => a.position - b.position);
  final List<_ExGroup> out = <_ExGroup>[];
  for (final WorkoutExercise e in sorted) {
    final _ExGroup? last = out.isEmpty ? null : out.last;
    final Iterable<({int pos, WorkoutSet set})> sets =
        e.sets.map((WorkoutSet s) => (pos: e.position, set: s));
    if (last != null && last.exerciseId == e.exerciseId) {
      last.positions.add(e.position);
      last.sets.addAll(sets);
    } else {
      out.add(_ExGroup(e.exerciseId, e.name, <int>[e.position], sets.toList()));
    }
  }
  return out;
}

/// Экран проведения тренировки клиента тренером. Загружает полную тренировку,
/// затем: черновик → план + «Начать»; активная → таймер, чек-лист, отдых,
/// завершение. Зеркало веб ActiveWorkoutPage (тренерский scope).
class ActiveWorkoutScreen extends ConsumerWidget {
  /// Серверный режим (как раньше): грузит тренировку по (clientId, workoutId) и
  /// проводит её прямыми серверными вызовами. Используется календарём/главной/FAB.
  const ActiveWorkoutScreen({super.key, required this.clientId, required this.workoutId})
      : localWorkoutId = null;

  /// Локальный (offline-first) режим: проведение идёт через локальный документ
  /// [LocalWorkout] (persist на диск, resume при перезапуске), при завершении —
  /// в Outbox на импорт. UI тот же — меняется только источник данных и действия.
  const ActiveWorkoutScreen.local({super.key, required String this.localWorkoutId})
      : clientId = null,
        workoutId = null;

  final String? clientId;
  final String? workoutId;
  final String? localWorkoutId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Локальный режим — грузим документ внутри _Conductor (в initState).
    if (localWorkoutId != null) {
      return _Conductor.local(localWorkoutId: localWorkoutId!);
    }
    final AsyncValue<Workout> w =
        ref.watch(trainerWorkoutProvider((clientId: clientId!, wid: workoutId!)));
    return w.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (Object e, _) => Scaffold(
        appBar: AppBar(),
        body: isOfflineError(e)
            ? NoConnectionView(
                onRetry: () => ref.invalidate(
                    trainerWorkoutProvider((clientId: clientId!, wid: workoutId!))))
            : Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    const Text('Не удалось загрузить тренировку'),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: () => ref.invalidate(
                          trainerWorkoutProvider((clientId: clientId!, wid: workoutId!))),
                      child: const Text('Повторить'),
                    ),
                  ],
                ),
              ),
      ),
      data: (Workout workout) =>
          _Conductor(clientId: clientId!, workout: workout),
    );
  }
}

class _Conductor extends ConsumerStatefulWidget {
  const _Conductor({required this.clientId, required this.workout}) : localWorkoutId = null;
  const _Conductor.local({required String this.localWorkoutId})
      : clientId = null,
        workout = null;
  final String? clientId;
  final Workout? workout;
  final String? localWorkoutId;

  @override
  ConsumerState<_Conductor> createState() => _ConductorState();
}

class _ConductorState extends ConsumerState<_Conductor> {
  // Источник рендера (обе ветки): в серверном режиме обновляется ответами API, в
  // локальном — пересчитывается из _doc.toWorkout() после каждого действия.
  late Workout _w;
  // Локальный документ (только в offline-режиме); в серверном — null.
  LocalWorkout? _doc;
  bool _loading = true;
  bool _notFound = false;
  bool _busy = false;

  bool get _isLocal => widget.localWorkoutId != null;
  LocalWorkoutController get _ctrl => ref.read(localWorkoutControllerProvider);
  // Раскрытые блоки упражнений (по exerciseId) — по умолчанию пусто = все свёрнуты.
  final Set<String> _expandedGroups = <String>{};
  // Инлайн-редактирование одной метрики прямо в строке подхода (без шторки):
  // какой показатель какого подхода правим + общее поле (один за раз).
  ({int pos, int setIndex, _MetricKind kind})? _editingMetric;
  final TextEditingController _metricCtrl = TextEditingController();
  ({String key, int left})? _rest;
  Timer? _restTimer;
  // Тикер общего времени тренировки (обновляет таймер «идёт тренировка» в шапке).
  Timer? _elapsedTimer;
  final AudioPlayer _player = AudioPlayer();
  // Дата исторической записи (excludedFromBalance) — по умолчанию сегодня.
  DateTime _historyDate = DateTime.now();
  // Контроллер флага «экран проведения открыт» — захватываем заранее, чтобы
  // сбросить его ПОСЛЕ dispose (менять провайдер прямо в dispose нельзя — флаг
  // застревал true и FAB пропадал везде).
  late final _onScreenCtrl = ref.read(activeWorkoutOnScreenProvider.notifier);

  String get _clientId => widget.clientId ?? _doc?.clientId ?? '';
  TrainerWorkoutsApi get _api => ref.read(trainerWorkoutsApiProvider);

  /// Пересчёт рендер-модели из локального документа (после каждого действия).
  void _sync() {
    if (mounted && _doc != null) setState(() => _w = _doc!.toWorkout());
  }

  @override
  void initState() {
    super.initState();
    if (_isLocal) {
      _loadLocal();
    } else {
      _w = widget.workout!;
      _loading = false;
    }
    // Раз в секунду обновляем таймер общего времени тренировки (пока active).
    _elapsedTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && !_loading && !_notFound && _w.status == WorkoutStatus.active) {
        setState(() {});
      }
    });
    // Пока открыт экран проведения — скрываем плавающий FAB; если тренировка
    // уже active — регистрируем её как «идущую» (только серверный режим: FAB и
    // указатель «идёт тренировка» серверные; локальный resume — через список).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _onScreenCtrl.state = true;
      if (!_isLocal && !_loading && _w.status == WorkoutStatus.active) {
        ref.read(activeWorkoutProvider.notifier).set(_clientId, _w.id, _w.name);
      }
    });
  }

  /// Загрузить локальный документ с диска (resume: переживает перезапуск).
  Future<void> _loadLocal() async {
    final LocalWorkout? d = await _ctrl.load(widget.localWorkoutId!);
    if (!mounted) return;
    setState(() {
      _doc = d;
      if (d != null) _w = d.toWorkout();
      _notFound = d == null;
      _loading = false;
    });
  }

  /// Слить очередь синка (после локального завершения). WidgetRef-совместимо —
  /// не используем drainOnline(Ref), т.к. здесь ref — WidgetRef.
  Future<void> _drain() async {
    try {
      await ref.read(syncEngineProvider).drain();
    } catch (_) {
      // офлайн/ошибка — элемент остаётся в очереди, уйдёт при связи
    }
    if (mounted) ref.invalidate(syncStatusProvider);
  }

  @override
  void dispose() {
    _restTimer?.cancel();
    _elapsedTimer?.cancel();
    _player.dispose();
    // Экран закрыт — снова разрешаем плавающий FAB (если тренировка ещё идёт).
    // Сброс откладываем на следующий кадр: менять провайдер в dispose нельзя,
    // иначе флаг застревает true и FAB не появляется.
    WidgetsBinding.instance.addPostFrameCallback((_) => _onScreenCtrl.state = false);
    _metricCtrl.dispose();
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

  /// Аналог [_run] для локальных действий (пишут на диск через контроллер, без
  /// сети): busy-guard + пересчёт рендер-модели ([_sync]) при успехе, при
  /// ошибке — SnackBar «Не удалось сохранить» и сброс _busy (иначе бросок при
  /// записи на диск проглатывался бы и busy застревал бы навсегда).
  Future<void> _runLocal(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      await action();
      if (!mounted) return;
      _sync();
      setState(() => _busy = false);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось сохранить')));
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
          // Добавляем в порядке ВЫБОРА (counts сохраняет порядок вставки), а не в
          // порядке каталога — иначе первое выбранное упражнение оказывается не
          // первым в списке.
          final Map<String, TExercise> byId = <String, TExercise>{
            for (final TExercise ex in catalog) ex.id: ex,
          };
          for (final MapEntry<String, int> e in counts.entries) {
            final TExercise? ex = byId[e.key];
            if (ex == null) continue;
            for (int i = 0; i < e.value; i++) {
              if (_isLocal) {
                await _runLocal(() => _ctrl.addExercise(
                      _doc!,
                      exerciseId: ex.id,
                      name: ex.name,
                      set: LocalSet(
                        setIndex: 0,
                        plannedReps: ex.defaultReps,
                        plannedWeightKg: ex.defaultWeightKg,
                        plannedTimeSec: ex.defaultTimeSec,
                        plannedRestSec: ex.restSec ?? 90,
                      ),
                    ));
              } else {
                await _run(() => _api.addExercise(_clientId, _w.id, ex));
              }
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
                videoFirst: true,
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

  /// Обновление подхода: локально — через контроллер (+пересчёт), иначе серверно.
  Future<void> _updSet(int pos, int setIndex, Map<String, dynamic> body) async {
    if (_isLocal) {
      await _runLocal(() => _ctrl.updateSet(
            _doc!,
            pos,
            setIndex,
            actualReps: body['actualReps'] as num?,
            actualWeightKg: body['actualWeightKg'] as num?,
            actualTimeSec: body['actualTimeSec'] as num?,
            plannedRestSec: body['plannedRestSec'] as num?,
            done: body['done'] as bool?,
          ));
    } else {
      await _run(() => _api.updateSet(_clientId, _w.id, pos, setIndex, body));
    }
  }

  Future<void> _toggleDone(WorkoutExercise ex, WorkoutSet s) async {
    // Лёгкая тактильная отдача — понятно, что нажатие «выполнено» сработало.
    HapticFeedback.lightImpact();
    final bool next = !s.done;
    final Map<String, dynamic> body = <String, dynamic>{'done': next};
    if (next && !s.hasFact) {
      if (s.plannedReps != null) body['actualReps'] = s.plannedReps;
      if (s.plannedWeightKg != null) body['actualWeightKg'] = s.plannedWeightKg;
      if (s.plannedTimeSec != null) body['actualTimeSec'] = s.plannedTimeSec;
    }
    await _updSet(ex.position, s.setIndex, body);
    if (next) _startRest(ex, s);
  }

  /// «+1» на свайпе: молча добавляет копию подхода (те же плановые параметры).
  Future<void> _addSetCopy(int pos, WorkoutSet s) async {
    HapticFeedback.lightImpact();
    if (_isLocal) {
      await _runLocal(() => _ctrl.addSet(_doc!, pos));
    } else {
      await _run(() => _api.addSet(_clientId, _w.id, pos, s));
    }
  }

  /// Удалить подход со свайпа — с подтверждением. Последний подход упражнения
  /// удаляет и само упражнение (обрабатывается бэкендом / контроллером).
  Future<void> _confirmDeleteSet(int pos, WorkoutSet s) async {
    if (!await confirmDelete(context, title: 'Удалить подход?')) return;
    if (_isLocal) {
      await _runLocal(() => _ctrl.deleteSet(_doc!, pos, s.setIndex));
    } else {
      await _run(() => _api.deleteSet(_clientId, _w.id, pos, s.setIndex));
    }
  }

  /// Перестановка блоков упражнений (order — старые позиции в новом порядке).
  Future<void> _reorder(List<int> order) async {
    if (_isLocal) {
      await _runLocal(() => _ctrl.reorder(_doc!, order));
    } else {
      await _run(() => _api.reorderExercises(_clientId, _w.id, order));
    }
  }

  /// Начать тренировку → active, и зарегистрировать её как «идущую» для FAB.
  Future<void> _start() async {
    // Для ПРИВЯЗАННОГО клиента тренировку можно начать только при наличии
    // согласованного (подтверждённого) незавершённого занятия.
    if (!await _canStart()) return;
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

  /// Можно ли начать тренировку. Привязанному клиенту нужен согласованный
  /// (подтверждённый) незавершённый занятие; иначе показываем окно и не стартуем.
  /// Для непривязанного клиента (нет аккаунта) проверки нет.
  Future<bool> _canStart() async {
    try {
      final Client client = await ref.read(trainerClientProvider(_clientId).future);
      if (!client.isConnected) return true; // непривязанный — согласовывать некому
      final List<Session> sessions = await ref.read(trainerSessionsProvider.future);
      final bool hasConfirmed = sessions.any((Session s) =>
          s.clientId == _clientId &&
          s.status == SessionStatus.planned &&
          s.confirmation == ClientConfirmation.confirmed);
      if (hasConfirmed) return true;
      if (mounted) await _showNoConfirmedDialog();
      return false;
    } catch (_) {
      return true; // не удалось проверить — не блокируем старт
    }
  }

  Future<void> _showNoConfirmedDialog() async {
    await showDialog<void>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Нет согласованных тренировок'),
        content: const Text(
            'Запланируйте и согласуйте занятие с клиентом в календаре — тогда тренировку можно будет начать.'),
        actions: <Widget>[
          FilledButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Понятно')),
        ],
      ),
    );
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
    // Локальный режим: завершаем документ (в Outbox на импорт) и уходим. Баланс,
    // календарь и история пересчитаются на сервере при импорте.
    if (_isLocal) {
      try {
        final String cid = _doc!.clientId;
        await _ctrl.complete(_doc!, durationSec: el > 0 ? el : null);
        ref.invalidate(localWorkoutsProvider(cid));
        ref.invalidate(pendingLocalWorkoutsProvider(cid));
        ref.read(activeWorkoutProvider.notifier).clear(); // тренировка завершена → убрать FAB
        unawaited(_drain());
        if (!mounted) return;
        await ref.read(appReviewServiceProvider).maybePromptAfterSuccess(
          context,
          onNegative: (BuildContext ctx) => Navigator.of(ctx).push<void>(
            MaterialPageRoute<void>(builder: (_) => const SupportChatScreen()),
          ),
        );
        if (!mounted) return;
        nav.pop();
        m.showSnackBar(const SnackBar(content: Text('Тренировка завершена')));
      } catch (_) {
        if (!mounted) return;
        setState(() => _busy = false);
        m.showSnackBar(const SnackBar(content: Text('Не удалось завершить тренировку')));
      }
      return;
    }
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
      // Даём диалогу «Оцените приложение» шанс показаться после успешной
      // тренировки — и только потом уходим с экрана.
      await ref.read(appReviewServiceProvider).maybePromptAfterSuccess(
        context,
        onNegative: (BuildContext ctx) => Navigator.of(ctx).push<void>(
          MaterialPageRoute<void>(builder: (_) => const SupportChatScreen()),
        ),
      );
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

  /// Длительность «M:SS» (или «H:MM:SS» от часа).
  String _fmtDuration(int totalSec) {
    final int s = totalSec % 60;
    final int m = (totalSec ~/ 60) % 60;
    final int h = totalSec ~/ 3600;
    String two(int n) => n.toString().padLeft(2, '0');
    return h > 0 ? '$h:${two(m)}:${two(s)}' : '$m:${two(s)}';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_notFound) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('Тренировка не найдена')),
      );
    }
    final AppColors c = context.colors;
    return Scaffold(
      appBar: AppBar(
        title: Text(_w.name),
        // Таймер общего времени тренировки — виден, пока тренировка идёт.
        actions: <Widget>[
          if (_w.status == WorkoutStatus.active)
            Padding(
              padding: const EdgeInsets.only(right: 14),
              child: Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Icon(Icons.timer_outlined, size: 18, color: c.accent),
                    const SizedBox(width: 5),
                    Text(_fmtDuration(_elapsed),
                        style: AppFonts.mono(size: 16, color: c.ink, weight: FontWeight.w700)),
                  ],
                ),
              ),
            ),
        ],
      ),
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
                  onPressed: _busy ? null : _start,
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                  child: const Text('Начать тренировку'),
                ),
        ),
      ],
    );
  }

  // ─────────── Активная ───────────
  Widget _buildActive(BuildContext context) {
    // Все упражнения одним списком (выполненные подходы остаются внутри своих
    // упражнений — отдельного раздела «Завершено» нет).
    final List<WorkoutExercise> allEx = <WorkoutExercise>[..._w.exercises]
      ..sort((a, b) => a.position - b.position);
    final List<_ExGroup> groups = _groupExercises(allEx);
    // Стабильный ключ раскрытия: exerciseId + порядковый номер блока среди
    // одноимённых. Не зависит от позиций (бэкенд перенумеровывает их при +1 или
    // удалении подхода), поэтому раскрытые блоки не схлопываются после правок.
    final Map<String, int> groupOcc = <String, int>{};
    final List<String> groupKeys = <String>[];
    for (final _ExGroup g in groups) {
      final int o = groupOcc[g.exerciseId] ?? 0;
      groupOcc[g.exerciseId] = o + 1;
      groupKeys.add('${g.exerciseId}#$o');
    }
    // Мини-превью упражнения (как при выборе) — по exerciseId из каталога.
    final List<TExercise> catalog =
        ref.watch(trainerCatalogProvider).valueOrNull ?? const <TExercise>[];
    final String base = ref.read(baseUrlProvider);
    String? thumbFor(String exerciseId) {
      final TExercise? e = catalog.where((TExercise x) => x.id == exerciseId).firstOrNull;
      return e == null ? null : catalogMediaUrl(base, e.thumbUrl ?? e.imageUrl);
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: <Widget>[
        // Все упражнения одним списком с drag-handle для перестановки целыми
        // блоками. Слева в свёрнутой шапке — мини-превью упражнения (как при выборе).
        ReorderableListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          buildDefaultDragHandles: false,
          itemCount: groups.length,
          onReorderItem: (int oldI, int newI) {
            final List<_ExGroup> gs = <_ExGroup>[...groups];
            final _ExGroup moved = gs.removeAt(oldI);
            gs.insert(newI, moved);
            final List<int> order = <int>[for (final _ExGroup g in gs) ...g.positions];
            _reorder(order);
          },
          itemBuilder: (BuildContext ctx, int i) {
            final _ExGroup g = groups[i];
            // Стабильный ключ блока (exerciseId + порядковый номер среди
            // одноимённых): несоседние одноимённые блоки независимы, но раскрытие
            // переживает перенумерацию позиций при +1/удалении подхода.
            final String gk = groupKeys[i];
            return _ExerciseBlock(
              key: ValueKey<String>('grp-$gk'),
              listIndex: i,
              group: g,
              thumbUrl: thumbFor(g.exerciseId),
              expanded: _expandedGroups.contains(gk),
              onToggle: () => setState(() {
                if (!_expandedGroups.remove(gk)) _expandedGroups.add(gk);
              }),
              onInfo: () => _showExerciseInfo(g.exerciseId),
              buildSetRow: _swipeSetRow,
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

  // ─── Инлайн-редактирование одного показателя подхода (тап по цифре) ───
  // Значение становится редактируемым полем прямо в строке (без отдельной
  // шторки). Повторы/вес/время сохраняются как факт (actual), отдых — как план
  // (plannedRestSec). Сохранение — по «готово» на клавиатуре или тапу вне поля.
  String _fmtMetric(num? v) => (v != null && v > 0)
      ? (v == v.roundToDouble() ? v.toInt().toString() : v.toString())
      : '';

  void _startEditMetric(int pos, WorkoutSet s, _MetricKind kind) {
    final ({int pos, int setIndex, _MetricKind kind})? prev = _editingMetric;
    if (prev != null) {
      if (prev.pos == pos && prev.setIndex == s.setIndex && prev.kind == kind) return;
      _saveMetricValue(prev); // сохранить прежнюю (текст ещё старый — читается синхронно)
    }
    final num? v = switch (kind) {
      _MetricKind.reps => s.actualReps ?? s.plannedReps,
      _MetricKind.weight => s.actualWeightKg ?? s.plannedWeightKg,
      _MetricKind.time => s.actualTimeSec ?? s.plannedTimeSec,
      _MetricKind.rest => s.plannedRestSec,
    };
    _metricCtrl.text = _fmtMetric(v);
    _metricCtrl.selection =
        TextSelection(baseOffset: 0, extentOffset: _metricCtrl.text.length);
    setState(() => _editingMetric = (pos: pos, setIndex: s.setIndex, kind: kind));
  }

  /// Сохранить значение показателя [rec] из текущего текста поля (не трогает
  /// _editingMetric — используется и при переключении на другую метрику).
  Future<void> _saveMetricValue(({int pos, int setIndex, _MetricKind kind}) rec) async {
    final num raw = num.tryParse(_metricCtrl.text.trim().replaceAll(',', '.')) ?? 0;
    // Сервер требует ПОВТОРЫ/ВРЕМЯ/ОТДЫХ целыми (иначе синк даёт 400) — ВЕС
    // остаётся дробным.
    final num value = rec.kind == _MetricKind.weight ? raw : raw.round();
    final Map<String, dynamic> body = switch (rec.kind) {
      _MetricKind.reps => <String, dynamic>{'actualReps': value},
      _MetricKind.weight => <String, dynamic>{'actualWeightKg': value},
      _MetricKind.time => <String, dynamic>{'actualTimeSec': value},
      _MetricKind.rest => <String, dynamic>{'plannedRestSec': value},
    };
    await _updSet(rec.pos, rec.setIndex, body);
  }

  /// Завершить инлайн-редактирование: убрать поле (клавиатура закроется вместе с
  /// ним) и сохранить значение.
  void _commitEditMetric() {
    final ({int pos, int setIndex, _MetricKind kind})? rec = _editingMetric;
    if (rec == null) return;
    setState(() => _editingMetric = null);
    _saveMetricValue(rec);
  }

  Widget _swipeSetRow(int pos, WorkoutSet s, int displayNo) {
    final AppColors c = context.colors;
    final WorkoutExercise ex = _w.exercises.firstWhere((WorkoutExercise e) => e.position == pos);
    return Slidable(
      key: ValueKey<String>('set-$pos-${s.setIndex}'),
      endActionPane: ActionPane(
        motion: const DrawerMotion(),
        extentRatio: 0.45,
        children: <Widget>[
          SlidableAction(
            onPressed: (_) => _addSetCopy(pos, s),
            backgroundColor: c.accent,
            foregroundColor: c.accentOn,
            icon: Icons.add,
            label: '+1',
          ),
          SlidableAction(
            onPressed: (_) => _confirmDeleteSet(pos, s),
            backgroundColor: c.danger,
            foregroundColor: Colors.white,
            icon: Icons.delete_outline,
            label: 'Удал.',
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          decoration: BoxDecoration(color: c.cardElevated, borderRadius: BorderRadius.circular(14)),
          child: Row(
            children: <Widget>[
              SizedBox(
                width: 24,
                child: Text('$displayNo',
                    style: AppFonts.mono(size: 14, color: c.inkMutedXl, weight: FontWeight.w700)),
              ),
              Expanded(
                child: _SetMetrics(
                  set: s,
                  showActual: s.hasFact || s.done,
                  onEdit: (_MetricKind kind) => _startEditMetric(pos, s, kind),
                  editingKind: (_editingMetric != null &&
                          _editingMetric!.pos == pos &&
                          _editingMetric!.setIndex == s.setIndex)
                      ? _editingMetric!.kind
                      : null,
                  editCtrl: _metricCtrl,
                  onSubmitEdit: _commitEditMetric,
                ),
              ),
              _CircleBtn(
                icon: Icons.check,
                onTap: () => _toggleDone(ex, s),
                bg: s.done ? c.accent : c.chip,
                fg: s.done ? c.accentOn : c.inkMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Блок упражнения (группа подходов) активной тренировки ───
/// Свёрнутая шапка: [drag] Название · «N подходов · X/N выполнено» · [▸/▾].
/// Тап по шапке/стрелке разворачивает список подходов (`buildSetRow` на каждый).
class _ExerciseBlock extends StatelessWidget {
  const _ExerciseBlock({
    super.key,
    required this.group,
    required this.expanded,
    required this.buildSetRow,
    this.thumbUrl,
    this.listIndex,
    this.onToggle,
    this.onInfo,
  });
  final _ExGroup group;
  final bool expanded;
  final Widget Function(int pos, WorkoutSet set, int displayNo) buildSetRow;
  // Мини-превью упражнения (как при выборе) — слева в свёрнутой шапке. null → плейсхолдер.
  final String? thumbUrl;
  final int? listIndex;
  final VoidCallback? onToggle;
  // Тап по «i» — шит с описанием техники + фото/видео (видео по умолчанию).
  final VoidCallback? onInfo;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final int total = group.sets.length;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(10, 10, 12, 10),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onToggle,
            child: Row(
              children: <Widget>[
                if (listIndex != null)
                  ReorderableDragStartListener(
                    index: listIndex!,
                    child: Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: Icon(Icons.drag_indicator, size: 20, color: c.inkMutedXl),
                    ),
                  ),
                CatalogThumb(url: thumbUrl, size: 46, radius: 10),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(group.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
                      Text('$total подходов · ${group.doneCount}/$total выполнено',
                          style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w500)),
                    ],
                  ),
                ),
                if (onInfo != null)
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: onInfo,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Icon(Icons.info_outline, size: 20, color: c.inkMuted),
                    ),
                  ),
                Icon(expanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                    color: c.inkMuted),
              ],
            ),
          ),
          if (expanded) ...<Widget>[
            const SizedBox(height: 6),
            for (int i = 0; i < group.sets.length; i++)
              buildSetRow(group.sets[i].pos, group.sets[i].set, i + 1),
          ],
        ],
      ),
    );
  }
}

/// Метрики подхода иконками как в базе знаний: повторы/вес/время/отдых.
// SVG-иконки метрик подхода (Material Symbols): вес / повторения / время / отдых.
const String _svgWeight =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="M240-200h480l-57-400H297l-57 400Zm240-480q17 0 28.5-11.5T520-720q0-17-11.5-28.5T480-760q-17 0-28.5 11.5T440-720q0 17 11.5 28.5T480-680Zm113 0h70q30 0 52 20t27 49l57 400q5 36-18.5 63.5T720-120H240q-37 0-60.5-27.5T161-211l57-400q5-29 27-49t52-20h70q-3-10-5-19.5t-2-20.5q0-50 35-85t85-35q50 0 85 35t35 85q0 11-2 20.5t-5 19.5ZM240-200h480-480Z"/></svg>';
const String _svgReps =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="M339.5-108.5q-65.5-28.5-114-77t-77-114Q120-365 120-440h80q0 117 81.5 198.5T480-160q117 0 198.5-81.5T760-440q0-117-81.5-198.5T480-720h-6l62 62-56 58-160-160 160-160 56 58-62 62h6q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-440q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-80q-75 0-140.5-28.5Z"/></svg>';
const String _svgTime =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="M360-840v-80h240v80H360Zm80 440h80v-240h-80v240Zm-99.5 291.5Q275-137 226-186t-77.5-114.5Q120-366 120-440t28.5-139.5Q177-645 226-694t114.5-77.5Q406-800 480-800q62 0 119 20t107 58l56-56 56 56-56 56q38 50 58 107t20 119q0 74-28.5 139.5T734-186q-49 49-114.5 77.5T480-80q-74 0-139.5-28.5ZM678-242q82-82 82-198t-82-198q-82-82-198-82t-198 82q-82 82-82 198t82 198q82 82 198 82t198-82ZM480-440Z"/></svg>';
const String _svgRest =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="M380-334h200v-60H468l112-126v-54H380v60h114L380-386v52Zm-40.5 225.5q-65.5-28.5-114-77t-77-114Q120-365 120-440t28.5-140.5q28.5-65.5 77-114t114-77Q405-800 480-800t140.5 28.5q65.5 28.5 114 77t77 114Q840-515 840-440t-28.5 140.5q-28.5 65.5-77 114t-114 77Q555-80 480-80t-140.5-28.5ZM224-866l56 56-170 170-56-56 170-170Zm512 0 170 170-56 56-170-170 56-56ZM480-160q117 0 198.5-81.5T760-440q0-117-81.5-198.5T480-720q-117 0-198.5 81.5T200-440q0 117 81.5 198.5T480-160Z"/></svg>';

/// Показатель подхода для быстрого редактирования тапом.
enum _MetricKind { reps, weight, time, rest }

class _SetMetrics extends StatelessWidget {
  const _SetMetrics({
    required this.set,
    this.showActual = false,
    this.onEdit,
    this.editingKind,
    this.editCtrl,
    this.onSubmitEdit,
  });
  final WorkoutSet set;
  final bool showActual;
  // Тап по показателю → инлайн-редактирование именно этой цифры (null → без тапа).
  final void Function(_MetricKind kind)? onEdit;
  // Инлайн-редактирование: если [editingKind] == kind, показатель рисуется полем
  // ввода [editCtrl]; [onSubmitEdit] — сохранить (готово/тап вне поля).
  final _MetricKind? editingKind;
  final TextEditingController? editCtrl;
  final VoidCallback? onSubmitEdit;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final num? reps = showActual ? (set.actualReps ?? set.plannedReps) : set.plannedReps;
    final num? weight = showActual ? (set.actualWeightKg ?? set.plannedWeightKg) : set.plannedWeightKg;
    final num? time = showActual ? (set.actualTimeSec ?? set.plannedTimeSec) : set.plannedTimeSec;
    final num? rest = set.plannedRestSec;

    Widget metric(String svg, num? v, _MetricKind kind) {
      final bool editing = editingKind == kind;
      return GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: (onEdit == null || editing) ? null : () => onEdit!(kind),
        child: Padding(
          padding: const EdgeInsets.only(right: 16),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              SvgPicture.string(
                svg,
                width: 18,
                height: 18,
                colorFilter: ColorFilter.mode(
                    editing ? c.accent : c.inkMutedXl, BlendMode.srcIn),
              ),
              const SizedBox(width: 5),
              if (editing)
                SizedBox(
                  width: 42,
                  child: TextField(
                    controller: editCtrl,
                    autofocus: true,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: <TextInputFormatter>[
                      FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
                    ],
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => onSubmitEdit?.call(),
                    onTapOutside: (_) => onSubmitEdit?.call(),
                    cursorColor: c.accent,
                    style: AppFonts.mono(size: 17, color: c.ink, weight: FontWeight.w700),
                    decoration: InputDecoration(
                      isDense: true,
                      contentPadding: const EdgeInsets.only(bottom: 3),
                      hintText: '0',
                      border: UnderlineInputBorder(borderSide: BorderSide(color: c.accent)),
                      enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: c.accent)),
                      focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: c.accent)),
                    ),
                  ),
                )
              else
                Text('${(v ?? 0).toInt()}',
                    style: AppFonts.mono(size: 17, color: c.inkMuted, weight: FontWeight.w600)),
            ],
          ),
        ),
      );
    }

    return Row(
      children: <Widget>[
        metric(_svgReps, reps, _MetricKind.reps),
        metric(_svgWeight, weight, _MetricKind.weight),
        metric(_svgTime, time, _MetricKind.time),
        metric(_svgRest, rest, _MetricKind.rest),
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
