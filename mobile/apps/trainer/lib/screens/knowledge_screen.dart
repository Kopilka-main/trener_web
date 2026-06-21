import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_assign.dart';
import '../api/trainer_catalog.dart';
import 'exercise_edit_screen.dart';
import 'template_edit_screen.dart';

/// База знаний тренера: вкладки «Тренировки» (шаблоны) и «Упражнения» (каталог).
/// Зеркало веб KnowledgeBasePage. FAB создаёт сущность активной вкладки.
class KnowledgeScreen extends ConsumerStatefulWidget {
  const KnowledgeScreen({super.key});

  @override
  ConsumerState<KnowledgeScreen> createState() => _KnowledgeScreenState();
}

class _KnowledgeScreenState extends ConsumerState<KnowledgeScreen> {
  bool _templatesTab = true;
  String _query = '';
  String _group = '';

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Scaffold(
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          final bool? saved = await Navigator.of(context).push<bool>(
            MaterialPageRoute<bool>(
              builder: (_) => _templatesTab ? const TemplateEditScreen() : const ExerciseEditScreen(),
            ),
          );
          if (saved == true) setState(() {});
        },
        child: const Icon(Icons.add),
      ),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Text('База знаний', style: AppFonts.display(size: 24, color: c.ink)),
            ),
            // Сегмент-переключатель вкладок.
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
                child: Row(
                  children: <Widget>[
                    _Seg(label: 'Тренировки', active: _templatesTab, onTap: () => setState(() { _templatesTab = true; _group = ''; })),
                    _Seg(label: 'Упражнения', active: !_templatesTab, onTap: () => setState(() { _templatesTab = false; _group = ''; })),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: TextField(
                onChanged: (String v) => setState(() => _query = v.trim().toLowerCase()),
                decoration: InputDecoration(
                  hintText: 'Поиск',
                  prefixIcon: const Icon(Icons.search, size: 20),
                  filled: true,
                  fillColor: c.card,
                  isDense: true,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                ),
              ),
            ),
            Expanded(child: _templatesTab ? _buildTemplates(c) : _buildExercises(c)),
          ],
        ),
      ),
    );
  }

  Widget _buildExercises(AppColors c) {
    final String base = ref.read(baseUrlProvider);
    final AsyncValue<List<TExercise>> catalog = ref.watch(trainerCatalogProvider);
    return catalog.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (Object e, _) => _err(c, () => ref.invalidate(trainerCatalogProvider)),
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
        if (all.isEmpty) return _empty(c, 'Пока нет упражнений. Добавьте первое.');
        return Column(
          children: <Widget>[
            _groupChips(c, groups),
            Expanded(
              child: list.isEmpty
                  ? _empty(c, 'Ничего не нашлось.')
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                      itemCount: list.length,
                      itemBuilder: (BuildContext ctx, int i) {
                        final TExercise ex = list[i];
                        return GestureDetector(
                          onTap: () async {
                            final bool? saved = await Navigator.of(context).push<bool>(
                              MaterialPageRoute<bool>(builder: (_) => ExerciseEditScreen(exercise: ex)),
                            );
                            if (saved == true) setState(() {});
                          },
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
                            child: Row(
                              children: <Widget>[
                                CatalogThumb(url: catalogMediaUrl(base, ex.thumbUrl ?? ex.imageUrl), size: 46),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: <Widget>[
                                      Text(ex.name,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                                      Text(
                                        <String>[
                                          if (ex.category.isNotEmpty) ex.category,
                                          if (ex.subgroup?.isNotEmpty == true) ex.subgroup!,
                                          if (ex.isGlobal) 'системное',
                                        ].join(' · '),
                                        style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500),
                                      ),
                                    ],
                                  ),
                                ),
                                Icon(Icons.chevron_right, size: 18, color: c.inkMutedXl),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildTemplates(AppColors c) {
    final AsyncValue<List<WorkoutTemplate>> templates = ref.watch(trainerTemplatesProvider);
    return templates.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (Object e, _) => _err(c, () => ref.invalidate(trainerTemplatesProvider)),
      data: (List<WorkoutTemplate> all) {
        final List<String> tags = <String>{
          for (final WorkoutTemplate t in all)
            if (t.categoryTag?.isNotEmpty == true) t.categoryTag!,
        }.toList()
          ..sort();
        final List<WorkoutTemplate> list = all.where((WorkoutTemplate t) {
          if (_group.isNotEmpty && t.categoryTag != _group) return false;
          if (_query.isNotEmpty && !t.name.toLowerCase().contains(_query)) return false;
          return true;
        }).toList();
        if (all.isEmpty) return _empty(c, 'Пока нет тренировок. Создайте первую.');
        return Column(
          children: <Widget>[
            _groupChips(c, tags),
            Expanded(
              child: list.isEmpty
                  ? _empty(c, 'Ничего не нашлось.')
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                      itemCount: list.length,
                      itemBuilder: (BuildContext ctx, int i) {
                        final WorkoutTemplate t = list[i];
                        return GestureDetector(
                          onTap: () async {
                            final bool? saved = await Navigator.of(context).push<bool>(
                              MaterialPageRoute<bool>(builder: (_) => TemplateEditScreen(template: t)),
                            );
                            if (saved == true) setState(() {});
                          },
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
                            child: Row(
                              children: <Widget>[
                                Container(
                                  width: 38,
                                  height: 38,
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(color: c.chip, shape: BoxShape.circle),
                                  child: Text('${t.exercises.length}',
                                      style: AppFonts.mono(size: 15, color: c.ink, weight: FontWeight.w700)),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: <Widget>[
                                      Text(t.name,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                                      Text(
                                        <String>[
                                          if (t.categoryTag?.isNotEmpty == true) t.categoryTag!,
                                          '${t.exercises.length} упр.',
                                        ].join(' · '),
                                        style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500),
                                      ),
                                    ],
                                  ),
                                ),
                                Icon(Icons.chevron_right, size: 18, color: c.inkMutedXl),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        );
      },
    );
  }

  Widget _groupChips(AppColors c, List<String> groups) {
    if (groups.isEmpty) return const SizedBox(height: 4);
    return SizedBox(
      height: 40,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: <Widget>[
          _Chip(label: 'Все', active: _group.isEmpty, onTap: () => setState(() => _group = '')),
          ...groups.map((String g) => _Chip(label: g, active: _group == g, onTap: () => setState(() => _group = g))),
        ],
      ),
    );
  }

  Widget _empty(AppColors c, String text) =>
      Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(text, textAlign: TextAlign.center, style: TextStyle(color: c.inkMuted))));

  Widget _err(AppColors c, VoidCallback retry) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text('Не удалось загрузить', style: TextStyle(color: c.inkMuted)),
            const SizedBox(height: 12),
            FilledButton(onPressed: retry, child: const Text('Повторить')),
          ],
        ),
      );
}

class _Seg extends StatelessWidget {
  const _Seg({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
              color: active ? c.accent : Colors.transparent, borderRadius: BorderRadius.circular(11)),
          child: Text(label,
              style: TextStyle(
                  fontSize: 14, fontWeight: FontWeight.w700, color: active ? c.accentOn : c.inkMuted)),
        ),
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
          decoration: BoxDecoration(color: active ? c.accent : c.chip, borderRadius: BorderRadius.circular(20)),
          child: Text(label,
              style: AppFonts.mono(size: 12, color: active ? c.accentOn : c.inkMuted, weight: FontWeight.w600)),
        ),
      ),
    );
  }
}
