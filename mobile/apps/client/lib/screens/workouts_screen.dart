import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/client_workouts.dart';
import 'active_workout_screen.dart';

/// Создать собственную тренировку: запросить имя → создать draft → открыть проведение.
Future<void> _createWorkout(BuildContext context, WidgetRef ref) async {
  // Захватываем messenger/nav до await — context не используется после async gap.
  final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
  final NavigatorState nav = Navigator.of(context);
  final TextEditingController ctrl = TextEditingController(text: 'Моя тренировка');
  final String? name = await showDialog<String>(
    context: context,
    builder: (BuildContext ctx) => AlertDialog(
      title: const Text('Новая тренировка'),
      content: TextField(
        controller: ctrl,
        autofocus: true,
        decoration: const InputDecoration(labelText: 'Название'),
      ),
      actions: <Widget>[
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Отмена')),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
          child: const Text('Создать'),
        ),
      ],
    ),
  );
  ctrl.dispose();
  if (name == null || name.isEmpty) return;
  try {
    final Workout w = await ref.read(clientWorkoutsApiProvider).create(name);
    ref.invalidate(clientWorkoutsProvider);
    await nav.push(MaterialPageRoute<void>(builder: (_) => ActiveWorkoutScreen(workout: w)));
    ref.invalidate(clientWorkoutsProvider);
  } catch (_) {
    messenger.showSnackBar(const SnackBar(content: Text('Не удалось создать тренировку')));
  }
}

const List<String> _ruMonths = <String>[
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

String _ruDate(DateTime d) => '${d.day} ${_ruMonths[d.month - 1]} ${d.year}';

String _duration(int? sec) {
  if (sec == null || sec <= 0) return '';
  final int m = sec ~/ 60;
  if (m < 60) return '$m мин';
  return '${m ~/ 60} ч ${m % 60} мин';
}

enum _Tab { assigned, history }

final StateProvider<_Tab> _tabProvider = StateProvider<_Tab>((_) => _Tab.assigned);

class WorkoutsScreen extends ConsumerWidget {
  const WorkoutsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Workout>> workouts = ref.watch(clientWorkoutsProvider);
    final _Tab tab = ref.watch(_tabProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Тренировки')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _createWorkout(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('Новая'),
      ),
      body: workouts.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Text('Не удалось загрузить тренировки'),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => ref.invalidate(clientWorkoutsProvider),
                child: const Text('Повторить'),
              ),
            ],
          ),
        ),
        data: (List<Workout> all) {
          final List<Workout> filtered = all.where((Workout w) {
            return tab == _Tab.assigned
                ? w.status == WorkoutStatus.draft
                : w.status == WorkoutStatus.completed;
          }).toList();
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(clientWorkoutsProvider),
            child: filtered.isEmpty
                ? ListView(
                    children: <Widget>[
                      SizedBox(height: MediaQuery.of(context).size.height * 0.3),
                      Center(
                        child: Text(
                          tab == _Tab.assigned ? 'Нет назначенных тренировок' : 'История пуста',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ),
                    ],
                  )
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                    itemCount: filtered.length,
                    itemBuilder: (BuildContext ctx, int i) => _WorkoutCard(workout: filtered[i]),
                  ),
          );
        },
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: SegmentedButton<_Tab>(
          segments: const <ButtonSegment<_Tab>>[
            ButtonSegment<_Tab>(value: _Tab.assigned, label: Text('Назначенные')),
            ButtonSegment<_Tab>(value: _Tab.history, label: Text('История')),
          ],
          selected: <_Tab>{tab},
          onSelectionChanged: (Set<_Tab> s) => ref.read(_tabProvider.notifier).state = s.first,
        ),
      ),
    );
  }
}

class _WorkoutCard extends ConsumerWidget {
  const _WorkoutCard({required this.workout});
  final Workout workout;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ColorScheme cs = Theme.of(context).colorScheme;
    final String subtitle = workout.completedAt != null
        ? _ruDate(workout.completedAt!)
        : (workout.createdByClient ? 'Ваша тренировка' : 'Назначена тренером');
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () {
          // Собственная незавершённая тренировка → экран проведения; иначе просмотр.
          final bool live = workout.createdByClient &&
              (workout.status == WorkoutStatus.draft || workout.status == WorkoutStatus.active);
          if (live) {
            Navigator.of(context)
                .push(MaterialPageRoute<void>(
                    builder: (_) => ActiveWorkoutScreen(workout: workout)))
                .then((_) => ref.invalidate(clientWorkoutsProvider));
          } else {
            context.push('/workout/${workout.id}', extra: workout);
          }
        },
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: <Widget>[
              Container(
                height: 42,
                width: 42,
                decoration: BoxDecoration(
                  color: cs.primary.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.fitness_center, size: 20, color: cs.primary),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(workout.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 3),
                    Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
              Text('${workout.exercises.length} упр.',
                  style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(width: 6),
              Icon(Icons.chevron_right, color: cs.onSurfaceVariant),
            ],
          ),
        ),
      ),
    );
  }
}

/// Деталь тренировки: упражнения и их подходы (план/факт). Только просмотр.
class WorkoutDetailScreen extends StatelessWidget {
  const WorkoutDetailScreen({super.key, required this.workout});
  final Workout workout;

  @override
  Widget build(BuildContext context) {
    final List<Widget> children = <Widget>[];
    if (workout.completedAt != null || workout.durationSec != null || workout.rpe != null) {
      final List<String> meta = <String>[
        if (workout.completedAt != null) _ruDate(workout.completedAt!),
        if (_duration(workout.durationSec).isNotEmpty) _duration(workout.durationSec),
        if (workout.rpe != null) 'RPE ${workout.rpe}',
      ];
      children.add(Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: Text(meta.join(' · '), style: Theme.of(context).textTheme.bodyMedium),
      ));
    }
    if (workout.trainerNote?.trim().isNotEmpty == true) {
      children.add(Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: _NoteCard(text: workout.trainerNote!.trim()),
      ));
    }
    for (final WorkoutExercise e in workout.exercises) {
      children.add(_ExerciseBlock(exercise: e));
    }
    if (workout.exercises.isEmpty) {
      children.add(const Padding(
        padding: EdgeInsets.all(32),
        child: Center(child: Text('Упражнения не добавлены')),
      ));
    }
    children.add(const SizedBox(height: 24));

    return Scaffold(
      appBar: AppBar(title: Text(workout.name)),
      body: ListView(children: children),
    );
  }
}

class _NoteCard extends StatelessWidget {
  const _NoteCard({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    final ColorScheme cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: cs.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(Icons.notes_outlined, size: 18, color: cs.onSurfaceVariant),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 14))),
        ],
      ),
    );
  }
}

class _ExerciseBlock extends StatelessWidget {
  const _ExerciseBlock({required this.exercise});
  final WorkoutExercise exercise;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(exercise.name,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          ...exercise.sets.map((WorkoutSet s) => _SetRow(set: s)),
        ],
      ),
    );
  }
}

class _SetRow extends StatelessWidget {
  const _SetRow({required this.set});
  final WorkoutSet set;

  /// Описание подхода: факт, если есть, иначе план. «8 × 50 кг» / «30 сек».
  String _describe() {
    final num? reps = set.actualReps ?? set.plannedReps;
    final num? weight = set.actualWeightKg ?? set.plannedWeightKg;
    final num? time = set.actualTimeSec ?? set.plannedTimeSec;
    final List<String> parts = <String>[];
    if (reps != null) parts.add('$reps повт.');
    if (weight != null && weight > 0) parts.add('$weight кг');
    if (time != null && time > 0) parts.add('$time сек');
    return parts.isEmpty ? '—' : parts.join(' × ');
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: <Widget>[
          SizedBox(
            width: 26,
            child: Text('${set.setIndex + 1}',
                style: TextStyle(fontWeight: FontWeight.w700, color: cs.onSurfaceVariant)),
          ),
          Expanded(child: Text(_describe(), style: const TextStyle(fontSize: 15))),
          Icon(
            set.done ? Icons.check_circle : Icons.radio_button_unchecked,
            size: 18,
            color: set.done ? cs.primary : cs.onSurfaceVariant,
          ),
        ],
      ),
    );
  }
}
