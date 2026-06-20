import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client_workouts.dart';
import '../stats/workout_stats.dart';

String _duration(int sec) {
  if (sec <= 0) return '0';
  final int h = sec ~/ 3600;
  final int m = (sec % 3600) ~/ 60;
  if (h > 0) return '$h ч ${m > 0 ? '$m м' : ''}'.trim();
  return '$m м';
}

/// Прогресс: сводные показатели по завершённым тренировкам + рекорды упражнений.
class ProgressScreen extends ConsumerWidget {
  const ProgressScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<List<Workout>> workouts = ref.watch(clientWorkoutsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Прогресс')),
      body: workouts.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => Center(
          child: FilledButton(
              onPressed: () => ref.invalidate(clientWorkoutsProvider), child: const Text('Повторить')),
        ),
        data: (List<Workout> all) {
          final ClientStats s = aggregateClientStats(all);
          final List<ExerciseOverview> records =
              aggregateExerciseOverview(all).where((ExerciseOverview e) => e.lastIsRecord).toList();
          if (s.completedWorkouts == 0) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text('Здесь появится статистика после ваших проведённых тренировок.',
                    textAlign: TextAlign.center, style: TextStyle(color: c.inkMuted)),
              ),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: <Widget>[
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 1.5,
                children: <Widget>[
                  _Stat(value: '${s.completedWorkouts}', label: 'тренировок'),
                  _Stat(value: '${s.tonnageKg}', label: 'кг тоннаж'),
                  _Stat(value: '${s.doneSets}', label: 'подходов'),
                  _Stat(value: '${s.totalReps}', label: 'повторов'),
                  _Stat(value: s.avgRpe != null ? '${s.avgRpe}' : '—', label: 'средний RPE'),
                  _Stat(value: _duration(s.totalDurationSec), label: 'в зале'),
                ],
              ),
              if (records.isNotEmpty) ...<Widget>[
                const SizedBox(height: 20),
                Padding(
                  padding: const EdgeInsets.only(left: 4, bottom: 8),
                  child: Text('СВЕЖИЕ РЕКОРДЫ',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.5, color: c.inkMutedXl)),
                ),
                ...records.take(20).map((ExerciseOverview e) => Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
                      child: Row(
                        children: <Widget>[
                          Icon(Icons.emoji_events, size: 18, color: c.accent),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(e.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                          ),
                          Text(e.isTimeBased ? '${e.maxTimeSec} с' : '${e.maxWeightKg} кг',
                              style: AppFonts.mono(size: 14, color: c.ink)),
                        ],
                      ),
                    )),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});
  final String value;
  final String label;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: c.line),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: AppFonts.display(size: 30, color: c.accent, letterSpacing: -1)),
          ),
          const SizedBox(height: 2),
          Text(label.toUpperCase(),
              style: AppFonts.mono(size: 10, color: c.inkMuted, weight: FontWeight.w700)),
        ],
      ),
    );
  }
}
