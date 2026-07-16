import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_assign.dart';
import '../widgets/no_connection_view.dart';

/// Назначение тренировки клиенту: имя + набор упражнений (с числом подходов) →
/// создаётся черновик у клиента («Назначено тренером»).
class AssignWorkoutScreen extends ConsumerStatefulWidget {
  const AssignWorkoutScreen({super.key, required this.clientId, required this.clientName});
  final String clientId;
  final String clientName;

  @override
  ConsumerState<AssignWorkoutScreen> createState() => _AssignWorkoutScreenState();
}

class _Picked {
  _Picked(this.ex, this.sets);
  final TExercise ex;
  int sets;
}

class _AssignWorkoutScreenState extends ConsumerState<AssignWorkoutScreen> {
  final TextEditingController _name = TextEditingController(text: 'Тренировка');
  final List<_Picked> _items = <_Picked>[];
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final TExercise? ex = await showModalBottomSheet<TExercise>(
      context: context,
      backgroundColor: context.colors.bg,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _ExercisePicker(),
    );
    if (ex == null) return;
    setState(() => _items.add(_Picked(ex, 3)));
  }

  Future<void> _assign() async {
    if (_items.isEmpty) return;
    setState(() => _busy = true);
    final NavigatorState nav = Navigator.of(context);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      final List<Map<String, dynamic>> exercises = _items
          .map((_Picked p) => <String, dynamic>{
                'exerciseId': p.ex.id,
                'sets': List<Map<String, dynamic>>.generate(p.sets, (_) => p.ex.plannedSet()),
              })
          .toList();
      final String name = _name.text.trim().isEmpty ? 'Тренировка' : _name.text.trim();
      await ref.read(trainerAssignApiProvider).assign(widget.clientId, name, exercises);
      if (!mounted) return;
      nav.pop(true);
      m.showSnackBar(const SnackBar(content: Text('Тренировка назначена')));
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось назначить тренировку')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Scaffold(
      appBar: AppBar(title: const Text('Назначить тренировку')),
      body: Column(
        children: <Widget>[
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              children: <Widget>[
                Text(widget.clientName, style: TextStyle(fontSize: 13, color: c.inkMuted)),
                const SizedBox(height: 12),
                TextField(
                  controller: _name,
                  decoration: const InputDecoration(labelText: 'Название', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 16),
                if (_items.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Center(
                      child: Text('Добавьте упражнения для плана',
                          style: TextStyle(color: c.inkMuted)),
                    ),
                  ),
                ..._items.asMap().entries.map((MapEntry<int, _Picked> e) {
                  final _Picked p = e.value;
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
                    decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
                    child: Row(
                      children: <Widget>[
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              Text(p.ex.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                              if (p.ex.category.isNotEmpty)
                                Text(p.ex.category,
                                    style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
                            ],
                          ),
                        ),
                        // Степпер количества подходов.
                        IconButton(
                          onPressed: p.sets > 1 ? () => setState(() => p.sets--) : null,
                          icon: const Icon(Icons.remove_circle_outline, size: 20),
                        ),
                        Text('${p.sets}', style: AppFonts.mono(size: 15, color: c.ink)),
                        IconButton(
                          onPressed: p.sets < 10 ? () => setState(() => p.sets++) : null,
                          icon: const Icon(Icons.add_circle_outline, size: 20),
                        ),
                        IconButton(
                          onPressed: () async {
                            if (await confirmDelete(context, title: 'Удалить упражнение?') && mounted) {
                              setState(() => _items.removeAt(e.key));
                            }
                          },
                          icon: Icon(Icons.delete_outline, size: 20, color: c.inkMuted),
                        ),
                      ],
                    ),
                  );
                }),
                const SizedBox(height: 4),
                OutlinedButton.icon(
                  onPressed: _busy ? null : _add,
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Добавить упражнение'),
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                ),
              ],
            ),
          ),
          SafeArea(
            minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: FilledButton(
              onPressed: (_busy || _items.isEmpty) ? null : _assign,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              child: _busy
                  ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Назначить'),
            ),
          ),
        ],
      ),
    );
  }
}

/// Пикер упражнения из каталога тренера: поиск + чипы групп.
class _ExercisePicker extends ConsumerStatefulWidget {
  const _ExercisePicker();
  @override
  ConsumerState<_ExercisePicker> createState() => _ExercisePickerState();
}

class _ExercisePickerState extends ConsumerState<_ExercisePicker> {
  String _query = '';
  String _group = '';

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
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
              error: (Object e, _) => isOfflineError(e)
                  ? NoConnectionView(onRetry: () => ref.invalidate(trainerCatalogProvider))
                  : Center(child: Text('Не удалось загрузить каталог', style: TextStyle(color: c.inkMuted))),
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
                                label: g, active: _group == g, onTap: () => setState(() => _group = g))),
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
                                return ListTile(
                                  title: Text(ex.name),
                                  subtitle: ex.category.isNotEmpty
                                      ? Text(<String>[
                                          ex.category,
                                          if (ex.subgroup?.isNotEmpty == true) ex.subgroup!,
                                        ].join(' · '))
                                      : null,
                                  onTap: () => Navigator.pop(context, ex),
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
