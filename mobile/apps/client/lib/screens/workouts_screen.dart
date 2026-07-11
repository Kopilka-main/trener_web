import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client_workouts.dart';
import '../stats/workout_stats.dart';

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

class WorkoutsScreen extends ConsumerWidget {
  const WorkoutsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<List<Workout>> workouts = ref.watch(clientWorkoutsProvider);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: workouts.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (Object e, _) => _Retry(onRetry: () => ref.invalidate(clientWorkoutsProvider)),
          data: (List<Workout> all) {
            final List<Workout> completed =
                all.where((Workout w) => w.status == WorkoutStatus.completed).toList();

            return RefreshIndicator(
              onRefresh: () async => ref.invalidate(clientWorkoutsProvider),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                children: <Widget>[
                  Text('Тренировки', style: AppFonts.display(size: 28, color: c.ink)),
                  const SizedBox(height: 16),
                  if (completed.isEmpty)
                    Text('Здесь будет история ваших тренировок.',
                        style: TextStyle(fontSize: 14, color: c.inkMuted))
                  else ...<Widget>[
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

/// Строка завершённой тренировки (только просмотр): разворот деталей.
class _HistoryRow extends ConsumerStatefulWidget {
  const _HistoryRow({required this.workout});
  final Workout workout;
  @override
  ConsumerState<_HistoryRow> createState() => _HistoryRowState();
}

class _HistoryRowState extends ConsumerState<_HistoryRow> {
  bool _expanded = false;

  String _meta() {
    final Workout w = widget.workout;
    return <String>[
      if (w.completedAt != null) _time(w.completedAt!),
      _exercisesText(w),
      if (w.durationSec != null && w.durationSec! > 0) '${(w.durationSec! / 60).round()} мин',
      if (w.rpe != null) 'RPE ${w.rpe}',
    ].join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final Workout w = widget.workout;
    final Map<int, String> labels = _exerciseLabels(w.exercises);
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
