import 'dart:async';

import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_assign.dart';
import '../api/trainer_client_card.dart';
import '../api/trainer_workouts.dart';

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

String _actualText(WorkoutSet s) {
  final List<String> p = <String>[
    if (s.actualReps != null) '${s.actualReps}',
    if (s.actualWeightKg != null) '× ${s.actualWeightKg} кг',
    if (s.actualTimeSec != null) '${s.actualTimeSec} с',
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
  Timer? _ticker;
  ({String key, int left})? _rest;
  Timer? _restTimer;

  String get _clientId => widget.clientId;
  TrainerWorkoutsApi get _api => ref.read(trainerWorkoutsApiProvider);

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_w.status == WorkoutStatus.active) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _restTimer?.cancel();
    super.dispose();
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
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      if (!silent) m.showSnackBar(const SnackBar(content: Text('Не удалось сохранить изменение')));
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
      } else {
        setState(() => _rest = (key: _rest!.key, left: left));
      }
    });
  }

  void _skipRest() {
    _restTimer?.cancel();
    setState(() => _rest = null);
  }

  Future<void> _addExercise() async {
    final TExercise? ex = await showModalBottomSheet<TExercise>(
      context: context,
      backgroundColor: context.colors.bg,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) =>
          _ExercisePicker(selectedIds: _w.exercises.map((WorkoutExercise e) => e.exerciseId).toSet()),
    );
    if (ex == null) return;
    await _run(() => _api.addExercise(_clientId, _w.id, ex));
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
      ref.invalidate(clientWorkoutsCardProvider(_clientId));
      if (!mounted) return;
      nav.pop();
      m.showSnackBar(const SnackBar(content: Text('Тренировка завершена')));
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось завершить тренировку')));
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
                itemCount: exs.length,
                onReorderItem: (int oldI, int newI) {
                  final List<int> order = exs.map((WorkoutExercise e) => e.position).toList();
                  final int moved = order.removeAt(oldI);
                  order.insert(newI, moved);
                  _run(() => _api.reorderExercises(_clientId, _w.id, order));
                },
                itemBuilder: (BuildContext ctx, int i) {
                  final WorkoutExercise ex = exs[i];
                  return _ExerciseCard(
                    key: ValueKey<int>(ex.position),
                    title: labels[ex.position] ?? ex.name,
                    child: Column(
                      children: ex.sets.map((WorkoutSet s) {
                        final String key = '${ex.position}-${s.setIndex}';
                        if (_editing == key) {
                          return _SetEditor(
                            planned: true,
                            set: s,
                            onCancel: () => setState(() => _editing = null),
                            onSave: (Map<String, dynamic> body) =>
                                _run(() => _api.updateSet(_clientId, _w.id, ex.position, s.setIndex, body)),
                          );
                        }
                        return _PlanRow(
                          text: _plannedText(s),
                          onEdit: () => setState(() => _editing = key),
                        );
                      }).toList(),
                    ),
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
          child: FilledButton(
            onPressed:
                (_busy || exs.isEmpty) ? null : () => _run(() => _api.start(_clientId, _w.id)),
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
              else
                GestureDetector(
                  onTap: _busy ? null : _complete,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
                    decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(20)),
                    child: Text('Завершить',
                        style: TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w600, color: c.accentOn)),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
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
        ...pending.map((WorkoutExercise ex) => _ExerciseCard(
              key: ValueKey<int>(ex.position),
              title: labels[ex.position] ?? ex.name,
              child: Column(children: ex.sets.map((WorkoutSet s) => _activeSetRow(ex, s)).toList()),
            )),
        const SizedBox(height: 8),
        _AddExerciseButton(onTap: _busy ? null : _addExercise),
        if (_w.exercises.isNotEmpty && pending.isEmpty) ...<Widget>[
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _complete,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
            child: const Text('Завершить'),
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
        planned: false,
        set: s,
        onCancel: () => setState(() => _editing = null),
        onSave: (Map<String, dynamic> body) async {
          body['done'] = true;
          await _run(() => _api.updateSet(_clientId, _w.id, ex.position, s.setIndex, body));
          _startRest(ex, s);
        },
        onDelete: () => _run(() => _api.removeExercise(_clientId, _w.id, ex.position)),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(s.hasFact ? _actualText(s) : _plannedText(s),
                style: AppFonts.mono(size: 19, color: c.inkMuted, weight: FontWeight.w500)),
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

// ─── Карточка упражнения ───
class _ExerciseCard extends StatelessWidget {
  const _ExerciseCard({super.key, required this.title, required this.child, this.onRemove});
  final String title;
  final Widget child;
  final VoidCallback? onRemove;

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
          Row(
            children: <Widget>[
              Expanded(
                child: Text(title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
              ),
              if (onRemove != null)
                GestureDetector(
                  onTap: onRemove,
                  child: Icon(Icons.delete_outline, size: 18, color: c.inkMuted),
                ),
            ],
          ),
          const SizedBox(height: 2),
          child,
        ],
      ),
    );
  }
}

class _PlanRow extends StatelessWidget {
  const _PlanRow({required this.text, required this.onEdit});
  final String text;
  final VoidCallback onEdit;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(text, style: AppFonts.mono(size: 19, color: c.inkMuted, weight: FontWeight.w500)),
          ),
          _CircleBtn(icon: Icons.edit, onTap: onEdit, bg: c.cardElevated, fg: c.inkMuted),
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

// ─── Редактор подхода (план/факт) ───
class _SetEditor extends StatefulWidget {
  const _SetEditor({
    required this.planned,
    required this.set,
    required this.onCancel,
    required this.onSave,
    this.onDelete,
  });
  final bool planned; // true → редактор плана (с отдыхом); false → факт
  final WorkoutSet set;
  final VoidCallback onCancel;
  final void Function(Map<String, dynamic>) onSave;
  final VoidCallback? onDelete;

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
    if (widget.planned) {
      _reps = TextEditingController(text: s.plannedReps?.toString() ?? '');
      _weight = TextEditingController(text: s.plannedWeightKg?.toString() ?? '');
      _time = TextEditingController(text: s.plannedTimeSec?.toString() ?? '');
      _rest = TextEditingController(text: s.plannedRestSec?.toString() ?? '');
    } else {
      _reps = TextEditingController(text: (s.actualReps ?? s.plannedReps)?.toString() ?? '');
      _weight = TextEditingController(text: (s.actualWeightKg ?? s.plannedWeightKg)?.toString() ?? '');
      _time = TextEditingController(text: (s.actualTimeSec ?? s.plannedTimeSec)?.toString() ?? '');
      _rest = TextEditingController();
    }
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
    if (widget.planned) {
      widget.onSave(<String, dynamic>{
        'plannedReps': _num(_reps.text),
        'plannedWeightKg': _num(_weight.text),
        'plannedTimeSec': _num(_time.text),
        'plannedRestSec': _num(_rest.text),
      });
    } else {
      widget.onSave(<String, dynamic>{
        'actualReps': _num(_reps.text),
        'actualWeightKg': _num(_weight.text),
        'actualTimeSec': _num(_time.text),
      });
    }
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
              if (widget.planned) ...<Widget>[
                const SizedBox(width: 8),
                _NumField(label: 'Отдых, с', ctrl: _rest),
              ],
            ],
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: <Widget>[
              _CircleBtn(icon: Icons.check, onTap: _save, bg: c.accent, fg: c.accentOn),
              const SizedBox(width: 8),
              _CircleBtn(icon: Icons.close, onTap: widget.onCancel, bg: c.cardElevated, fg: c.inkMuted),
              if (widget.onDelete != null) ...<Widget>[
                const SizedBox(width: 8),
                _CircleBtn(
                    icon: Icons.delete_outline, onTap: widget.onDelete!, bg: c.cardElevated, fg: c.danger),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _NumField extends StatelessWidget {
  const _NumField({required this.label, required this.ctrl});
  final String label;
  final TextEditingController ctrl;
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
            child: TextField(
              controller: ctrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
              textAlign: TextAlign.center,
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

// ─── Пикер упражнения из полного каталога тренера ───
class _ExercisePicker extends ConsumerStatefulWidget {
  const _ExercisePicker({required this.selectedIds});
  final Set<String> selectedIds;
  @override
  ConsumerState<_ExercisePicker> createState() => _ExercisePickerState();
}

class _ExercisePickerState extends ConsumerState<_ExercisePicker> {
  String _query = '';
  String _group = '';

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final String base = ref.read(baseUrlProvider);
    final AsyncValue<List<TExercise>> catalog = ref.watch(trainerCatalogProvider);
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.82,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text('Добавить упражнение',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: c.ink)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              onChanged: (String v) => setState(() => _query = v.trim().toLowerCase()),
              decoration: InputDecoration(
                hintText: 'Поиск упражнения',
                prefixIcon: const Icon(Icons.search, size: 20),
                filled: true,
                fillColor: c.card,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
              ),
            ),
          ),
          Expanded(
            child: catalog.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (Object e, _) => Center(
                  child: Text('Не удалось загрузить каталог', style: TextStyle(color: c.inkMuted))),
              data: (List<TExercise> all) {
                final List<String> groups = <String>{
                  for (final TExercise e in all)
                    if (e.category.isNotEmpty) e.category,
                }.toList()
                  ..sort();
                final List<TExercise> list = all.where((TExercise e) {
                  if (_group.isNotEmpty && e.category != _group) return false;
                  if (_query.isNotEmpty && !e.name.toLowerCase().contains(_query)) return false;
                  return true;
                }).toList();
                return Column(
                  children: <Widget>[
                    if (groups.isNotEmpty)
                      SizedBox(
                        height: 38,
                        child: ListView(
                          scrollDirection: Axis.horizontal,
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          children: <Widget>[
                            _Chip(label: 'Все', active: _group.isEmpty, onTap: () => setState(() => _group = '')),
                            ...groups.map((String g) => _Chip(
                                  label: g,
                                  active: _group == g,
                                  onTap: () => setState(() => _group = g),
                                )),
                          ],
                        ),
                      ),
                    Expanded(
                      child: list.isEmpty
                          ? Center(child: Text('Ничего не найдено', style: TextStyle(color: c.inkMuted)))
                          : ListView.builder(
                              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                              itemCount: list.length,
                              itemBuilder: (BuildContext ctx, int i) {
                                final TExercise ex = list[i];
                                final bool picked = widget.selectedIds.contains(ex.id);
                                return Container(
                                  margin: const EdgeInsets.only(bottom: 8),
                                  decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
                                  child: Row(
                                    children: <Widget>[
                                      Expanded(
                                        child: GestureDetector(
                                          onTap: () => Navigator.pop(context, ex),
                                          behavior: HitTestBehavior.opaque,
                                          child: Padding(
                                            padding: const EdgeInsets.all(10),
                                            child: Row(
                                              children: <Widget>[
                                                CatalogThumb(
                                                    url: catalogMediaUrl(base, ex.thumbUrl ?? ex.imageUrl),
                                                    size: 44),
                                                const SizedBox(width: 10),
                                                Container(
                                                  width: 24,
                                                  height: 24,
                                                  alignment: Alignment.center,
                                                  decoration: BoxDecoration(
                                                    color: picked ? c.accent : Colors.transparent,
                                                    borderRadius: BorderRadius.circular(7),
                                                    border: picked ? null : Border.all(color: c.line),
                                                  ),
                                                  child: picked
                                                      ? Icon(Icons.check, size: 14, color: c.accentOn)
                                                      : null,
                                                ),
                                                const SizedBox(width: 10),
                                                Expanded(
                                                  child: Column(
                                                    crossAxisAlignment: CrossAxisAlignment.start,
                                                    children: <Widget>[
                                                      Text(ex.name,
                                                          maxLines: 1,
                                                          overflow: TextOverflow.ellipsis,
                                                          style: TextStyle(
                                                              fontSize: 15,
                                                              fontWeight: FontWeight.w600,
                                                              color: c.ink)),
                                                      if (ex.category.isNotEmpty || ex.subgroup != null)
                                                        Text(
                                                          <String>[
                                                            if (ex.category.isNotEmpty) ex.category,
                                                            if (ex.subgroup?.isNotEmpty == true) ex.subgroup!,
                                                          ].join(' · '),
                                                          style: AppFonts.mono(
                                                              size: 12, color: c.inkMuted, weight: FontWeight.w500),
                                                        ),
                                                    ],
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ),
                                      ),
                                      IconButton(
                                        onPressed: () => _showInfo(context, ex, base),
                                        icon: Icon(Icons.info_outline, size: 18, color: c.inkMuted),
                                        tooltip: 'Об упражнении',
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
                    ),
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

void _showInfo(BuildContext context, TExercise ex, String base) {
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.colors.bg,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (BuildContext ctx) {
      final AppColors c = ctx.colors;
      final String muscles = <String>[
        if (ex.category.isNotEmpty) ex.category,
        if (ex.subgroup?.isNotEmpty == true) ex.subgroup!,
      ].join(' · ');
      final String? img = catalogMediaUrl(base, ex.imageUrl ?? ex.thumbUrl);
      final String? video = catalogMediaUrl(base, ex.videoUrl);
      return Padding(
        padding: EdgeInsets.fromLTRB(20, 4, 20, 16 + MediaQuery.of(ctx).viewPadding.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            if (img != null || video != null) ...<Widget>[
              CatalogMediaView(imageUrl: img, videoUrl: video, height: 200),
              const SizedBox(height: 12),
            ],
            Text(ex.name, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: c.ink)),
            if (muscles.isNotEmpty) ...<Widget>[
              const SizedBox(height: 2),
              Text(muscles, style: TextStyle(fontSize: 13, color: c.inkMuted)),
            ],
            const SizedBox(height: 12),
            if (ex.equipment?.isNotEmpty == true) _InfoLine(label: 'Оборудование', value: ex.equipment!),
            if (ex.primaryMuscles?.isNotEmpty == true) _InfoLine(label: 'Целевые', value: ex.primaryMuscles!),
            if (ex.secondaryMuscles?.isNotEmpty == true) _InfoLine(label: 'Дополнительно', value: ex.secondaryMuscles!),
            if (ex.description?.isNotEmpty == true) ...<Widget>[
              const SizedBox(height: 8),
              Text(ex.description!, style: TextStyle(fontSize: 14, height: 1.4, color: c.ink)),
            ],
          ],
        ),
      );
    },
  );
}

class _InfoLine extends StatelessWidget {
  const _InfoLine({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(width: 110, child: Text(label, style: TextStyle(fontSize: 14, color: c.inkMuted))),
          Expanded(child: Text(value, style: TextStyle(fontSize: 14, color: c.ink))),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
              color: active ? c.accent : c.chip, borderRadius: BorderRadius.circular(20)),
          child: Text(label,
              style: AppFonts.mono(size: 12, color: active ? c.accentOn : c.inkMuted, weight: FontWeight.w500)),
        ),
      ),
    );
  }
}
