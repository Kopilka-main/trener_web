import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/client_auth.dart';
import '../api/client_templates.dart';
import '../api/client_workouts.dart';
import '../stats/workout_stats.dart';
import 'active_workout_screen.dart';

const List<String> _ruMonths = <String>[
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

bool _sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

/// Группа-метка даты: «Сегодня» / «Вчера» / «5 июня» (+год если не текущий).
String _dateGroup(DateTime d) {
  final DateTime now = DateTime.now();
  if (_sameDay(d, now)) return 'Сегодня';
  if (_sameDay(d, now.subtract(const Duration(days: 1)))) return 'Вчера';
  final String base = '${d.day} ${_ruMonths[d.month - 1]}';
  return d.year == now.year ? base : '$base ${d.year}';
}

String _time(DateTime d) =>
    '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

/// Сколько упражнений выполнено: «N из M упр.» при отклонении, иначе «M упр.».
String _exercisesText(Workout w) {
  final int total = w.exercises.length;
  final int done = w.exercises
      .where((WorkoutExercise ex) => ex.sets.any((WorkoutSet s) =>
          s.done || s.actualReps != null || s.actualWeightKg != null || s.actualTimeSec != null))
      .length;
  return done < total ? '$done из $total упр.' : '$total упр.';
}

/// Открыть проведение собственной тренировки и обновить список по возврату.
Future<void> _openRun(BuildContext context, WidgetRef ref, Workout w) async {
  await Navigator.of(context)
      .push(MaterialPageRoute<void>(builder: (_) => ActiveWorkoutScreen(workout: w)));
  ref.invalidate(clientWorkoutsProvider);
}

class WorkoutsScreen extends ConsumerWidget {
  const WorkoutsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<List<Workout>> workouts = ref.watch(clientWorkoutsProvider);
    // Подключён ли клиент к тренеру — приоритет №1 верхнего блока (см. spec).
    final bool linked = ref.watch(clientLinkedProvider).valueOrNull ?? true;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: workouts.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (Object e, _) => _Retry(onRetry: () => ref.invalidate(clientWorkoutsProvider)),
          data: (List<Workout> all) {
            final Workout? current =
                all.where((Workout w) => w.status == WorkoutStatus.active).firstOrNull;
            final List<Workout> completed =
                all.where((Workout w) => w.status == WorkoutStatus.completed).toList();
            final List<Workout> assigned = all
                .where((Workout w) => !w.createdByClient && w.status == WorkoutStatus.draft)
                .toList();

            return RefreshIndicator(
              onRefresh: () async => ref.invalidate(clientWorkoutsProvider),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                children: <Widget>[
                  Text('Тренировки', style: AppFonts.display(size: 28, color: c.ink)),
                  const SizedBox(height: 16),
                  if (!linked)
                    Text(
                      'Вы пока не подключены к тренеру. Подключите его, чтобы здесь появились '
                      'назначенные тренировки.',
                      style: TextStyle(fontSize: 14, color: c.inkMuted),
                    )
                  else if (current != null)
                    _ContinueCard(workout: current, onOpen: () => _openRun(context, ref, current))
                  else
                    _NewWorkoutCard(
                      hasHistory: completed.isNotEmpty,
                      onPickBase: () => _openTemplatePicker(context, ref, all),
                      onPickHistory: () => _openHistoryPicker(context, ref, completed),
                    ),
                  if (assigned.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 20),
                    _SectionLabel('Назначено тренером', color: c.inkMutedXl),
                    const SizedBox(height: 8),
                    ...assigned.map((Workout w) => Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: _AssignedRow(workout: w),
                        )),
                  ],
                  if (completed.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 20),
                    _SectionLabel('Завершённые', color: c.inkMutedXl),
                    const SizedBox(height: 8),
                    ..._grouped(completed).expand((MapEntry<String, List<Workout>> g) => <Widget>[
                          Padding(
                            padding: const EdgeInsets.fromLTRB(4, 6, 4, 6),
                            child: Text(g.key.toUpperCase(),
                                style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 0.5,
                                    color: c.accent)),
                          ),
                          ...g.value.map((Workout w) => Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: _HistoryRow(workout: w),
                              )),
                        ]),
                  ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  List<MapEntry<String, List<Workout>>> _grouped(List<Workout> ws) {
    final List<MapEntry<String, List<Workout>>> groups = <MapEntry<String, List<Workout>>>[];
    for (final Workout w in ws) {
      final String label = w.completedAt != null ? _dateGroup(w.completedAt!) : 'Без даты';
      if (groups.isNotEmpty && groups.last.key == label) {
        groups.last.value.add(w);
      } else {
        groups.add(MapEntry<String, List<Workout>>(label, <Workout>[w]));
      }
    }
    return groups;
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text, {required this.color});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(left: 4),
        child: Text(text.toUpperCase(),
            style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.5, color: color)),
      );
}

class _Retry extends StatelessWidget {
  const _Retry({required this.onRetry});
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Text('Не удалось загрузить тренировки'),
            const SizedBox(height: 12),
            FilledButton(onPressed: onRetry, child: const Text('Повторить')),
          ],
        ),
      );
}

/// Карточка текущей (активной) тренировки — крупная, с кнопкой «Продолжить».
class _ContinueCard extends StatelessWidget {
  const _ContinueCard({required this.workout, required this.onOpen});
  final Workout workout;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onOpen,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(24)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(workout.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: c.ink)),
            const SizedBox(height: 2),
            Text('${workout.exercises.length} упр. · идёт',
                style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(vertical: 13),
              decoration: BoxDecoration(color: c.accent, borderRadius: BorderRadius.circular(16)),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: <Widget>[
                  Icon(Icons.play_arrow, size: 18, color: c.accentOn),
                  const SizedBox(width: 6),
                  Text('Продолжить',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.accentOn)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Плейсхолдер новой тренировки: пунктир, «Выбрать из базы» + «повторить из истории».
class _NewWorkoutCard extends StatelessWidget {
  const _NewWorkoutCard({
    required this.hasHistory,
    required this.onPickBase,
    required this.onPickHistory,
  });
  final bool hasHistory;
  final VoidCallback onPickBase;
  final VoidCallback onPickHistory;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: c.line, width: 2, style: BorderStyle.solid),
      ),
      child: Column(
        children: <Widget>[
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: c.chip, shape: BoxShape.circle),
            child: Icon(Icons.add, size: 20, color: c.ink),
          ),
          const SizedBox(height: 12),
          Text('Тренировка не запланирована',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
          const SizedBox(height: 4),
          Text('Выберите готовый шаблон — и сразу тренируйтесь.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: c.inkMuted)),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: onPickBase,
              style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 13)),
              child: const Text('Выбрать из базы'),
            ),
          ),
          const SizedBox(height: 8),
          TextButton.icon(
            onPressed: hasHistory ? onPickHistory : null,
            icon: const Icon(Icons.refresh, size: 14),
            label: const Text('или повторить из истории'),
            style: TextButton.styleFrom(foregroundColor: c.inkMuted),
          ),
        ],
      ),
    );
  }
}

/// Строка назначенной тренером тренировки → деталь (только просмотр).
class _AssignedRow extends StatelessWidget {
  const _AssignedRow({required this.workout});
  final Workout workout;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: () => context.push('/workout/${workout.id}', extra: workout),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
        child: Row(
          children: <Widget>[
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(workout.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                  const SizedBox(height: 2),
                  Text('${workout.exercises.length} упр.',
                      style: TextStyle(fontSize: 12, color: c.inkMuted)),
                ],
              ),
            ),
            Icon(Icons.chevron_right, size: 18, color: c.inkMutedXl),
          ],
        ),
      ),
    );
  }
}

/// Строка завершённой тренировки: разворот деталей, повтор, сохранить как шаблон.
class _HistoryRow extends ConsumerStatefulWidget {
  const _HistoryRow({required this.workout});
  final Workout workout;
  @override
  ConsumerState<_HistoryRow> createState() => _HistoryRowState();
}

class _HistoryRowState extends ConsumerState<_HistoryRow> {
  bool _expanded = false;
  bool _saved = false;
  bool _busy = false;

  String _meta() {
    final Workout w = widget.workout;
    return <String>[
      if (w.completedAt != null) _time(w.completedAt!),
      _exercisesText(w),
      if (w.durationSec != null && w.durationSec! > 0) '${(w.durationSec! / 60).round()} мин',
      if (w.rpe != null) 'RPE ${w.rpe}',
    ].join(' · ');
  }

  Future<void> _repeat() async {
    final List<Map<String, dynamic>> plan = repeatPlan(widget.workout);
    if (plan.isEmpty) return;
    setState(() => _busy = true);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      final Workout w = await ref
          .read(clientWorkoutsApiProvider)
          .createFromPlan(widget.workout.name, plan);
      ref.invalidate(clientWorkoutsProvider);
      if (!mounted) return;
      setState(() => _busy = false);
      await _openRun(context, ref, w);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось повторить тренировку')));
    }
  }

  Future<void> _saveTemplate() async {
    final List<Map<String, dynamic>> plan = templatePlan(widget.workout);
    if (plan.isEmpty) return;
    setState(() => _busy = true);
    try {
      await ref.read(clientTemplatesApiProvider).save(widget.workout.name, plan);
      ref.invalidate(clientTemplatesProvider);
      if (!mounted) return;
      setState(() {
        _saved = true;
        _busy = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final Workout w = widget.workout;
    final Map<int, String> labels = _exerciseLabels(w.exercises);
    final bool canRepeat = w.exercises.any((WorkoutExercise ex) => ex.sets.any((WorkoutSet s) => s.done));
    return Container(
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
            child: Row(
              children: <Widget>[
                Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _expanded = !_expanded),
                    behavior: HitTestBehavior.opaque,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Row(
                          children: <Widget>[
                            Flexible(
                              child: Text(w.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                      fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                  color: c.chip, borderRadius: BorderRadius.circular(6)),
                              child: Text(w.createdByClient ? 'своя' : 'от тренера',
                                  style: TextStyle(
                                      fontSize: 10, fontWeight: FontWeight.w600, color: c.inkMuted)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(_meta(), style: AppFonts.mono(size: 11, color: c.inkMuted, weight: FontWeight.w500)),
                      ],
                    ),
                  ),
                ),
                _RoundBtn(
                  icon: Icons.refresh,
                  enabled: canRepeat && !_busy,
                  onTap: _repeat,
                ),
                const SizedBox(width: 4),
                _RoundBtn(
                  icon: _expanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                  enabled: true,
                  onTap: () => setState(() => _expanded = !_expanded),
                ),
              ],
            ),
          ),
          if (_expanded)
            Container(
              width: double.infinity,
              decoration: BoxDecoration(border: Border(top: BorderSide(color: c.line))),
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  if (w.exercises.isEmpty)
                    Text('Упражнений нет', style: TextStyle(fontSize: 12, color: c.inkMuted)),
                  ...w.exercises.map((WorkoutExercise ex) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Expanded(
                              child: Text(labels[ex.position] ?? ex.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                      fontSize: 12, fontWeight: FontWeight.w500, color: c.ink)),
                            ),
                            const SizedBox(width: 8),
                            Text(_exerciseSummary(ex),
                                style: AppFonts.mono(size: 11, color: c.inkMuted, weight: FontWeight.w500)),
                          ],
                        ),
                      )),
                  if (w.trainerNote?.trim().isNotEmpty == true)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text('«${w.trainerNote!.trim()}»',
                          style: TextStyle(
                              fontSize: 12, fontStyle: FontStyle.italic, color: c.inkMuted)),
                    ),
                  if (w.exercises.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 10),
                    GestureDetector(
                      onTap: (_saved || _busy) ? null : _saveTemplate,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                            color: c.cardElevated, borderRadius: BorderRadius.circular(12)),
                        child: Text(
                            _saved
                                ? 'В шаблонах ✓'
                                : _busy
                                    ? 'Сохраняем…'
                                    : 'Сохранить как шаблон',
                            style: TextStyle(
                                fontSize: 12, fontWeight: FontWeight.w600, color: c.ink)),
                      ),
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

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

String _exerciseSummary(WorkoutExercise ex) {
  final WorkoutSet? first = ex.sets.firstOrNull;
  if (first == null) return '';
  final num? reps = first.actualReps ?? first.plannedReps;
  final num? weight = first.actualWeightKg ?? first.plannedWeightKg;
  final num? time = first.actualTimeSec ?? first.plannedTimeSec;
  final String head = ex.sets.length > 1 ? '${ex.sets.length}× ' : '';
  final String body = <String>[
    if (reps != null) '$reps',
    if (weight != null) '× $weight кг',
    if (time != null) '$time с',
  ].join(' ');
  return '$head$body';
}

class _RoundBtn extends StatelessWidget {
  const _RoundBtn({required this.icon, required this.enabled, required this.onTap});
  final IconData icon;
  final bool enabled;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Opacity(
      opacity: enabled ? 1 : 0.4,
      child: GestureDetector(
        onTap: enabled ? onTap : null,
        child: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(color: c.cardElevated, shape: BoxShape.circle),
          child: Icon(icon, size: 16, color: c.inkMuted),
        ),
      ),
    );
  }
}

// ─────────────────────────── Пикеры ───────────────────────────

void _openTemplatePicker(BuildContext context, WidgetRef ref, List<Workout> all) {
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.colors.bg,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _TemplatePickerSheet(all: all),
  );
}

void _openHistoryPicker(BuildContext context, WidgetRef ref, List<Workout> completed) {
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.colors.bg,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _HistoryPickerSheet(history: completed),
  );
}

/// Пикер шаблона: свои шаблоны + проведённые тренером тренировки.
class _TemplatePickerSheet extends ConsumerWidget {
  const _TemplatePickerSheet({required this.all});
  final List<Workout> all;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<List<ClientTemplate>> templates = ref.watch(clientTemplatesProvider);
    final List<Workout> trainerDone = all
        .where((Workout w) => !w.createdByClient && w.status == WorkoutStatus.completed && w.exercises.isNotEmpty)
        .toList()
      ..sort((Workout a, Workout b) => (b.completedAt ?? DateTime(0)).compareTo(a.completedAt ?? DateTime(0)));

    Future<void> pick(String name, List<Map<String, dynamic>> plan) async {
      final NavigatorState nav = Navigator.of(context);
      final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
      try {
        final Workout w = await ref.read(clientWorkoutsApiProvider).createFromPlan(name, plan);
        ref.invalidate(clientWorkoutsProvider);
        nav.pop();
        await nav.push(MaterialPageRoute<void>(builder: (_) => ActiveWorkoutScreen(workout: w)));
        ref.invalidate(clientWorkoutsProvider);
      } catch (_) {
        m.showSnackBar(const SnackBar(content: Text('Не удалось создать тренировку')));
      }
    }

    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.7,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text('Выберите шаблон',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: c.ink)),
          ),
          Expanded(
            child: templates.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (Object e, _) => Center(child: Text('Не удалось загрузить', style: TextStyle(color: c.inkMuted))),
              data: (List<ClientTemplate> tpls) {
                if (tpls.isEmpty && trainerDone.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          Text(
                            'Шаблонов пока нет. Они появятся из проведённых тренером тренировок или когда вы сохраните тренировку как шаблон.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: c.inkMuted),
                          ),
                          const SizedBox(height: 20),
                          // Шаблонов нет — предлагаем создать новую тренировку с нуля.
                          FilledButton.icon(
                            onPressed: () => pick('Новая тренировка', <Map<String, dynamic>>[]),
                            icon: const Icon(Icons.add, size: 18),
                            label: const Text('Создать новую тренировку'),
                            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                          ),
                        ],
                      ),
                    ),
                  );
                }
                return ListView(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                  children: <Widget>[
                    ...tpls.map((ClientTemplate t) => _PickRow(
                          count: t.count,
                          name: t.name,
                          onTap: () => pick(t.name, t.exercises),
                          onDelete: () async {
                            await ref.read(clientTemplatesApiProvider).delete(t.id);
                            ref.invalidate(clientTemplatesProvider);
                          },
                        )),
                    ...trainerDone.map((Workout w) => _PickRow(
                          count: w.exercises.length,
                          name: w.name,
                          onTap: () => pick(w.name, templatePlan(w)),
                        )),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _PickRow extends StatelessWidget {
  const _PickRow({required this.count, required this.name, required this.onTap, this.onDelete});
  final int count;
  final String name;
  final VoidCallback onTap;
  final Future<void> Function()? onDelete;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      child: Row(
        children: <Widget>[
          Expanded(
            child: GestureDetector(
              onTap: onTap,
              behavior: HitTestBehavior.opaque,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: <Widget>[
                    Container(
                      width: 40,
                      height: 40,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: c.chip, shape: BoxShape.circle),
                      child: Text('$count', style: AppFonts.mono(size: 14, color: c.ink)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                          Text('$count упр.',
                              style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (onDelete != null)
            IconButton(
              onPressed: () async {
                if (await confirmDelete(context, title: 'Удалить шаблон?')) onDelete!();
              },
              icon: Icon(Icons.delete_outline, size: 20, color: c.inkMuted),
              tooltip: 'Удалить шаблон',
            ),
        ],
      ),
    );
  }
}

/// Пикер повтора из истории.
class _HistoryPickerSheet extends ConsumerWidget {
  const _HistoryPickerSheet({required this.history});
  final List<Workout> history;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    Future<void> pick(Workout w) async {
      final List<Map<String, dynamic>> plan = repeatPlan(w);
      if (plan.isEmpty) return;
      final NavigatorState nav = Navigator.of(context);
      final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
      try {
        final Workout nw = await ref.read(clientWorkoutsApiProvider).createFromPlan(w.name, plan);
        ref.invalidate(clientWorkoutsProvider);
        nav.pop();
        await nav.push(MaterialPageRoute<void>(builder: (_) => ActiveWorkoutScreen(workout: nw)));
        ref.invalidate(clientWorkoutsProvider);
      } catch (_) {
        m.showSnackBar(const SnackBar(content: Text('Не удалось повторить')));
      }
    }

    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.7,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text('Повторить из истории',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: c.ink)),
          ),
          Expanded(
            child: history.isEmpty
                ? Center(child: Text('История пуста', style: TextStyle(color: c.inkMuted)))
                : ListView(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                    children: history.map((Workout w) {
                      final bool canRepeat =
                          w.exercises.any((WorkoutExercise ex) => ex.sets.any((WorkoutSet s) => s.done));
                      return Opacity(
                        opacity: canRepeat ? 1 : 0.4,
                        child: GestureDetector(
                          onTap: canRepeat ? () => pick(w) : null,
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.all(14),
                            decoration:
                                BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
                            child: Row(
                              children: <Widget>[
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: <Widget>[
                                      Text(w.name,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                              fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                                      Text(
                                        '${w.completedAt != null ? _dateGroup(w.completedAt!) : 'Без даты'} · ${_exercisesText(w)}',
                                        style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500),
                                      ),
                                    ],
                                  ),
                                ),
                                Icon(Icons.refresh, size: 16, color: c.inkMuted),
                              ],
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
          ),
        ],
      ),
    );
  }
}

/// Факт подхода: время приоритетнее; иначе «повторы × вес кг»; иначе «—».
String _factText(WorkoutSet s) {
  if (s.actualTimeSec != null) return '${s.actualTimeSec} сек';
  if (s.actualReps != null || s.actualWeightKg != null) {
    final String reps = s.actualReps?.toString() ?? '—';
    final String kg = s.actualWeightKg != null ? ' × ${s.actualWeightKg} кг' : '';
    return '$reps$kg';
  }
  return '—';
}

/// План подхода с префиксом «план »: время приоритетнее; иначе «повторы × вес кг».
String _planText(WorkoutSet s) {
  if (s.plannedTimeSec != null) return 'план ${s.plannedTimeSec} сек';
  final String reps = s.plannedReps?.toString() ?? '—';
  final String kg = s.plannedWeightKg != null ? ' × ${s.plannedWeightKg} кг' : '';
  return 'план $reps$kg';
}

/// Итоги тренировки (только просмотр): мета, заметка тренера, упражнения с
/// фактом/планом по подходам и глобальной пометкой рекордов. Зеркало WorkoutDetailPage.
class WorkoutDetailScreen extends ConsumerWidget {
  const WorkoutDetailScreen({super.key, required this.workout});
  final Workout workout;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    // Рекорды — глобальная пометка по всей истории, а не в рамках этой тренировки.
    final List<Workout> all = ref.watch(clientWorkoutsProvider).valueOrNull ?? <Workout>[];
    final Set<String> recordKeys = computeRecordKeys(all);

    final List<String> meta = <String>[
      if (workout.completedAt != null) _dateGroup(workout.completedAt!),
      if (workout.durationSec != null && workout.durationSec! > 0) '${(workout.durationSec! / 60).round()} мин',
      if (workout.rpe != null) 'RPE ${workout.rpe}',
    ];

    final List<Widget> children = <Widget>[
      Text(workout.name, style: AppFonts.display(size: 24, color: c.ink)),
      if (meta.isNotEmpty) ...<Widget>[
        const SizedBox(height: 4),
        Text(meta.join(' · '), style: TextStyle(fontSize: 12, color: c.inkMuted)),
      ],
      if (workout.trainerNote?.trim().isNotEmpty == true) ...<Widget>[
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
          child: Text(workout.trainerNote!.trim(),
              style: TextStyle(fontSize: 13, color: c.inkMuted)),
        ),
      ],
      const SizedBox(height: 12),
    ];

    for (final WorkoutExercise e in workout.exercises) {
      children.add(Container(
        margin: const EdgeInsets.only(bottom: 12),
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(e.name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
            const SizedBox(height: 8),
            ...e.sets.map((WorkoutSet s) {
              final bool isRecord = recordKeys.contains(setKey(workout.id, e.position, s.setIndex));
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: <Widget>[
                    Flexible(
                      child: Text(_factText(s),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 14, color: c.ink)),
                    ),
                    if (isRecord) ...<Widget>[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                            color: c.accent, borderRadius: BorderRadius.circular(6)),
                        child: Text('рекорд',
                            style: TextStyle(
                                fontSize: 10, fontWeight: FontWeight.w700, color: c.accentOn)),
                      ),
                    ],
                    const Spacer(),
                    Text(_planText(s),
                        style: TextStyle(fontSize: 12, color: c.inkMutedXl)),
                  ],
                ),
              );
            }),
          ],
        ),
      ));
    }
    if (workout.exercises.isEmpty) {
      children.add(Padding(
        padding: const EdgeInsets.all(32),
        child: Center(child: Text('Упражнения не добавлены', style: TextStyle(color: c.inkMuted))),
      ));
    }

    return Scaffold(
      appBar: AppBar(title: Text(workout.name)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: children,
      ),
    );
  }
}
