import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client_workouts.dart';

/// Экран проведения собственной тренировки: добавление упражнений из каталога,
/// старт, лог подходов (факт + отметка) и завершение. Держит живой объект и
/// обновляет его из ответов API.
class ActiveWorkoutScreen extends ConsumerStatefulWidget {
  const ActiveWorkoutScreen({super.key, required this.workout});
  final Workout workout;

  @override
  ConsumerState<ActiveWorkoutScreen> createState() => _ActiveWorkoutScreenState();
}

class _ActiveWorkoutScreenState extends ConsumerState<ActiveWorkoutScreen> {
  late Workout _w = widget.workout;
  bool _busy = false;

  ClientWorkoutsApi get _api => ref.read(clientWorkoutsApiProvider);

  Future<void> _run(Future<Workout> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    try {
      final Workout updated = await action();
      if (!mounted) return;
      setState(() {
        _w = updated;
        _busy = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      messenger.showSnackBar(const SnackBar(content: Text('Не удалось сохранить изменение')));
    }
  }

  Future<void> _addExercise() async {
    final CatalogExercise? ex = await showModalBottomSheet<CatalogExercise>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _ExercisePicker(),
    );
    if (ex == null) return;
    await _run(() => _api.addExercise(_w.id, ex, 3));
  }

  Future<void> _editSet(WorkoutExercise ex, WorkoutSet s) async {
    final _SetInput? input = await showDialog<_SetInput>(
      context: context,
      builder: (_) => _SetDialog(set: s),
    );
    if (input == null) return;
    await _run(() => _api.updateSet(
          _w.id,
          ex.position,
          s.setIndex,
          actualReps: input.reps,
          actualWeightKg: input.weight,
          done: true,
        ));
  }

  Future<void> _toggleDone(WorkoutExercise ex, WorkoutSet s) async {
    await _run(() => _api.updateSet(_w.id, ex.position, s.setIndex, done: !s.done));
  }

  Future<void> _complete() async {
    final int? rpe = await showDialog<int>(
      context: context,
      builder: (_) => const _RpeDialog(),
    );
    if (rpe == null) return; // отменили диалог
    if (!mounted) return;
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    final NavigatorState nav = Navigator.of(context);
    setState(() => _busy = true);
    try {
      await _api.complete(_w.id, rpe: rpe == 0 ? null : rpe);
      ref.invalidate(clientWorkoutsProvider);
      if (!mounted) return;
      nav.pop();
      messenger.showSnackBar(const SnackBar(content: Text('Тренировка завершена')));
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      messenger.showSnackBar(const SnackBar(content: Text('Не удалось завершить тренировку')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final bool started = _w.status == WorkoutStatus.active;
    final List<Widget> children = <Widget>[];

    if (_w.status == WorkoutStatus.draft) {
      children.add(Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
        child: FilledButton.icon(
          onPressed: _busy ? null : () => _run(() => _api.start(_w.id)),
          icon: const Icon(Icons.play_arrow, size: 20),
          label: const Text('Начать тренировку'),
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
        ),
      ));
    }

    for (final WorkoutExercise e in _w.exercises) {
      children.add(_ExerciseBlock(
        exercise: e,
        canLog: started,
        onTapSet: (WorkoutSet s) => _editSet(e, s),
        onToggle: (WorkoutSet s) => _toggleDone(e, s),
      ));
    }

    children.add(Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: OutlinedButton.icon(
        onPressed: _busy ? null : _addExercise,
        icon: const Icon(Icons.add, size: 18),
        label: const Text('Добавить упражнение'),
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
      ),
    ));
    children.add(const SizedBox(height: 24));

    return Scaffold(
      appBar: AppBar(title: Text(_w.name)),
      body: Stack(
        children: <Widget>[
          ListView(children: children),
          if (_busy)
            const Positioned(
              top: 0, left: 0, right: 0,
              child: LinearProgressIndicator(minHeight: 2),
            ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: FilledButton(
          onPressed: (_busy || _w.exercises.isEmpty) ? null : _complete,
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
          child: const Text('Завершить тренировку'),
        ),
      ),
    );
  }
}

class _ExerciseBlock extends StatelessWidget {
  const _ExerciseBlock({
    required this.exercise,
    required this.canLog,
    required this.onTapSet,
    required this.onToggle,
  });
  final WorkoutExercise exercise;
  final bool canLog;
  final void Function(WorkoutSet) onTapSet;
  final void Function(WorkoutSet) onToggle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(exercise.name,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          ...exercise.sets.map((WorkoutSet s) => _SetRow(
                set: s,
                canLog: canLog,
                onTap: () => onTapSet(s),
                onToggle: () => onToggle(s),
              )),
        ],
      ),
    );
  }
}

class _SetRow extends StatelessWidget {
  const _SetRow({
    required this.set,
    required this.canLog,
    required this.onTap,
    required this.onToggle,
  });
  final WorkoutSet set;
  final bool canLog;
  final VoidCallback onTap;
  final VoidCallback onToggle;

  String _describe() {
    final num? reps = set.actualReps ?? set.plannedReps;
    final num? weight = set.actualWeightKg ?? set.plannedWeightKg;
    final num? time = set.actualTimeSec ?? set.plannedTimeSec;
    final List<String> parts = <String>[];
    if (reps != null) parts.add('$reps повт.');
    if (weight != null && weight > 0) parts.add('$weight кг');
    if (time != null && time > 0) parts.add('$time сек');
    return parts.isEmpty ? 'нажмите, чтобы заполнить' : parts.join(' × ');
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme cs = Theme.of(context).colorScheme;
    return InkWell(
      onTap: canLog ? onTap : null,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: <Widget>[
            SizedBox(
              width: 26,
              child: Text('${set.setIndex + 1}',
                  style: TextStyle(fontWeight: FontWeight.w700, color: cs.onSurfaceVariant)),
            ),
            Expanded(child: Text(_describe(), style: const TextStyle(fontSize: 15))),
            IconButton(
              onPressed: canLog ? onToggle : null,
              icon: Icon(
                set.done ? Icons.check_circle : Icons.radio_button_unchecked,
                color: set.done ? cs.primary : cs.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SetInput {
  _SetInput({this.reps, this.weight});
  final num? reps;
  final num? weight;
}

class _SetDialog extends StatefulWidget {
  const _SetDialog({required this.set});
  final WorkoutSet set;

  @override
  State<_SetDialog> createState() => _SetDialogState();
}

class _SetDialogState extends State<_SetDialog> {
  late final TextEditingController _reps = TextEditingController(
      text: (widget.set.actualReps ?? widget.set.plannedReps)?.toString() ?? '');
  late final TextEditingController _weight = TextEditingController(
      text: (widget.set.actualWeightKg ?? widget.set.plannedWeightKg)?.toString() ?? '');

  @override
  void dispose() {
    _reps.dispose();
    _weight.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Подход ${widget.set.setIndex + 1}'),
      content: Row(
        children: <Widget>[
          Expanded(
            child: TextField(
              controller: _reps,
              keyboardType: TextInputType.number,
              inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'Повторы'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: TextField(
              controller: _weight,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: <TextInputFormatter>[
                FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
              ],
              decoration: const InputDecoration(labelText: 'Вес, кг'),
            ),
          ),
        ],
      ),
      actions: <Widget>[
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Отмена')),
        FilledButton(
          onPressed: () {
            final num? reps = int.tryParse(_reps.text.trim());
            final num? weight = num.tryParse(_weight.text.trim().replaceAll(',', '.'));
            Navigator.pop(context, _SetInput(reps: reps, weight: weight));
          },
          child: const Text('Готово'),
        ),
      ],
    );
  }
}

class _RpeDialog extends StatefulWidget {
  const _RpeDialog();

  @override
  State<_RpeDialog> createState() => _RpeDialogState();
}

class _RpeDialogState extends State<_RpeDialog> {
  double _rpe = 7;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Завершить тренировку'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('Насколько тяжело? RPE ${_rpe.round()}'),
          Slider(
            value: _rpe,
            min: 1,
            max: 10,
            divisions: 9,
            label: '${_rpe.round()}',
            onChanged: (double v) => setState(() => _rpe = v),
          ),
        ],
      ),
      actions: <Widget>[
        TextButton(
          onPressed: () => Navigator.pop(context, 0), // завершить без RPE
          child: const Text('Без оценки'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, _rpe.round()),
          child: const Text('Завершить'),
        ),
      ],
    );
  }
}

/// Пикер упражнения из каталога с поиском. Возвращает выбранное упражнение.
class _ExercisePicker extends ConsumerStatefulWidget {
  const _ExercisePicker();

  @override
  ConsumerState<_ExercisePicker> createState() => _ExercisePickerState();
}

class _ExercisePickerState extends ConsumerState<_ExercisePicker> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<CatalogExercise>> catalog = ref.watch(clientCatalogProvider);
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.75,
      child: Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              autofocus: true,
              decoration: const InputDecoration(
                hintText: 'Поиск упражнения…',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (String v) => setState(() => _query = v.trim().toLowerCase()),
            ),
          ),
          Expanded(
            child: catalog.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (Object e, _) => Center(
                child: TextButton(
                  onPressed: () => ref.invalidate(clientCatalogProvider),
                  child: const Text('Повторить загрузку'),
                ),
              ),
              data: (List<CatalogExercise> all) {
                final List<CatalogExercise> list = _query.isEmpty
                    ? all
                    : all.where((CatalogExercise e) =>
                        e.name.toLowerCase().contains(_query) ||
                        e.category.toLowerCase().contains(_query)).toList();
                if (list.isEmpty) {
                  return const Center(child: Text('Ничего не найдено'));
                }
                return ListView.builder(
                  itemCount: list.length,
                  itemBuilder: (BuildContext ctx, int i) => ListTile(
                    title: Text(list[i].name),
                    subtitle: list[i].category.isNotEmpty ? Text(list[i].category) : null,
                    onTap: () => Navigator.pop(context, list[i]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
