import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_slidable/flutter_slidable.dart';

import '../api/trainer_assign.dart';
import '../api/trainer_catalog.dart';
import '../widgets/nav_bar.dart';
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
  bool _personal = false; // вкладка «Тренировки»: false → общие, true → персональные
  String _query = '';
  String _group = '';
  String _subgroup = ''; // второй уровень (только вкладка «Упражнения»)
  final TextEditingController _searchCtrl = TextEditingController();
  // Контроллер контекстной кнопки «+» нижнего меню (захватываем заранее).
  late final _navFabCtrl = ref.read(navFabProvider.notifier);

  @override
  void initState() {
    super.initState();
    // FAB «создать» переносим в нижнее меню. Действие читает активную вкладку
    // (_templatesTab) в момент нажатия — что именно создавать.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _navFabCtrl.state = (loc: '/knowledge', icon: Icons.add, onTap: _onAddKnowledge);
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    final ctrl = _navFabCtrl;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (ctrl.state?.loc == '/knowledge') ctrl.state = null;
    });
    super.dispose();
  }

  /// Создать сущность активной вкладки: шаблон тренировки или упражнение.
  Future<void> _onAddKnowledge() async {
    final bool? saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => _templatesTab ? const TemplateEditScreen() : const ExerciseEditScreen(),
      ),
    );
    if (saved == true && mounted) setState(() {});
  }

  /// Открыть шаблон в редакторе (тап по строке).
  Future<void> _openTemplate(WorkoutTemplate t) async {
    final bool? saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(builder: (_) => TemplateEditScreen(template: t)),
    );
    if (saved == true && mounted) setState(() {});
  }

  /// Дубль шаблона: копия с тем же составом и scope (общий/персональный).
  Future<void> _duplicateTemplate(WorkoutTemplate t) async {
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      await ref.read(trainerCatalogApiProvider).createTemplate(
        <String, dynamic>{
          'name': '${t.name} (копия)',
          'categoryTag': t.categoryTag,
          'shortDescription': t.shortDescription,
          'exercises': t.exercises.map((TemplateExercise e) => e.toPayload()).toList(),
        },
        clientId: t.clientId,
      );
      ref.invalidate(trainerTemplatesProvider);
    } catch (_) {
      m.showSnackBar(const SnackBar(content: Text('Не удалось создать дубль')));
    }
  }

  /// Удалить шаблон (с подтверждением).
  Future<void> _deleteTemplate(WorkoutTemplate t) async {
    final bool ok = await confirmDelete(context,
        title: 'Удалить тренировку?', message: '«${t.name}» будет удалена.');
    if (!ok || !mounted) return;
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      await ref.read(trainerCatalogApiProvider).deleteTemplate(t.id);
      ref.invalidate(trainerTemplatesProvider);
    } catch (_) {
      m.showSnackBar(const SnackBar(content: Text('Не удалось удалить')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Scaffold(
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
                    _Seg(label: 'Тренировки', active: _templatesTab, onTap: () => setState(() { _templatesTab = true; _group = ''; _subgroup = ''; })),
                    _Seg(label: 'Упражнения', active: !_templatesTab, onTap: () => setState(() { _templatesTab = false; _group = ''; _subgroup = ''; })),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: TextField(
                controller: _searchCtrl,
                onChanged: (String v) => setState(() => _query = v),
                decoration: InputDecoration(
                  hintText: 'Поиск',
                  prefixIcon: const Icon(Icons.search, size: 20),
                  suffixIcon: _query.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close, size: 18),
                          tooltip: 'Очистить',
                          onPressed: () {
                            _searchCtrl.clear();
                            setState(() => _query = '');
                          },
                        ),
                  filled: true,
                  fillColor: c.card,
                  isDense: true,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                ),
              ),
            ),
            // Подпереключатель «Общие / Персональные» — только на вкладке «Тренировки».
            if (_templatesTab) _buildScopeSwitcher(c),
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
        // Подгруппы текущей группы: по таксономии + фактически присутствующие.
        final List<String> subgroups = _group.isEmpty
            ? const <String>[]
            : _orderedSubgroups(
                _group,
                all
                    .where((TExercise e) => e.category == _group && (e.subgroup?.isNotEmpty == true))
                    .map((TExercise e) => e.subgroup!));
        final List<TExercise> filtered = all.where((TExercise e) {
          if (_group.isNotEmpty && e.category != _group) return false;
          if (_subgroup.isNotEmpty && e.subgroup != _subgroup) return false;
          return true;
        }).toList();
        final List<TExercise> list = rankBySearch(filtered, _query, (TExercise e) => e.name);
        if (all.isEmpty) return _empty(c, 'Пока нет упражнений. Добавьте первое.');
        return Column(
          children: <Widget>[
            _groupChips(c, groups),
            if (subgroups.isNotEmpty) const SizedBox(height: 6),
            if (subgroups.isNotEmpty) _subgroupChips(c, subgroups),
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
                            padding: const EdgeInsets.fromLTRB(10, 8, 12, 8),
                            decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
                            child: Row(
                              children: <Widget>[
                                CatalogThumb(url: catalogMediaUrl(base, ex.thumbUrl ?? ex.imageUrl), size: 64, radius: 10),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: <Widget>[
                                      Text(ex.name,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                                      const SizedBox(height: 4),
                                      _MetricsRow(ex: ex),
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

  Widget _subgroupChips(AppColors c, List<String> subs) {
    return SizedBox(
      height: 38,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: <Widget>[
          _Chip(label: 'Все', active: _subgroup.isEmpty, onTap: () => setState(() => _subgroup = '')),
          ...subs.map((String s) => _Chip(label: s, active: _subgroup == s, onTap: () => setState(() => _subgroup = s))),
        ],
      ),
    );
  }

  /// Подпереключатель scope шаблонов: «Общие» (clientId == null) / «Персональные».
  /// Две равные кнопки нормального размера (сегмент-переключатель).
  Widget _buildScopeSwitcher(AppColors c) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        child: Row(
          children: <Widget>[
            Expanded(
              child: _ScopeBtn(label: 'Общие', active: !_personal, onTap: () => setState(() => _personal = false)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _ScopeBtn(
                  label: 'Персональные', active: _personal, onTap: () => setState(() => _personal = true)),
            ),
          ],
        ),
      );

  Widget _buildTemplates(AppColors c) {
    final AsyncValue<List<WorkoutTemplate>> templates = ref.watch(trainerTemplatesProvider);
    return templates.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (Object e, _) => _err(c, () => ref.invalidate(trainerTemplatesProvider)),
      data: (List<WorkoutTemplate> all) {
        // Общие/персональные по clientId. Чипы categoryTag — только для общих.
        final List<WorkoutTemplate> general =
            all.where((WorkoutTemplate t) => !t.isPersonal).toList();
        final List<WorkoutTemplate> scoped =
            _personal ? all.where((WorkoutTemplate t) => t.isPersonal).toList() : general;
        final List<String> tags = <String>{
          for (final WorkoutTemplate t in general)
            if (t.categoryTag?.isNotEmpty == true) t.categoryTag!,
        }.toList()
          ..sort();
        final List<WorkoutTemplate> filtered = scoped.where((WorkoutTemplate t) {
          if (!_personal && _group.isNotEmpty && t.categoryTag != _group) return false;
          return true;
        }).toList();
        // В персональных ищем и по названию тренировки, и по имени клиента.
        final List<WorkoutTemplate> list = rankBySearch(
          filtered,
          _query,
          (WorkoutTemplate t) => _personal ? '${t.name} ${t.clientName ?? ''}' : t.name,
        );
        if (all.isEmpty) return _emptyTemplates(c);
        return Column(
          children: <Widget>[
            if (!_personal) _groupChips(c, tags),
            Expanded(
              child: list.isEmpty
                  ? _empty(
                      c,
                      scoped.isEmpty
                          ? (_personal ? 'Пока нет персональных тренировок.' : 'Пока нет общих тренировок.')
                          : 'Ничего не нашлось.')
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                      itemCount: list.length,
                      itemBuilder: (BuildContext ctx, int i) {
                        final WorkoutTemplate t = list[i];
                        return _TemplateCard(
                          key: ValueKey<String>(t.id),
                          template: t,
                          onOpen: () => _openTemplate(t),
                          onDuplicate: () => _duplicateTemplate(t),
                          onDelete: () => _deleteTemplate(t),
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
          _Chip(label: 'Все', active: _group.isEmpty, onTap: () => setState(() { _group = ''; _subgroup = ''; })),
          ...groups.map((String g) => _Chip(label: g, active: _group == g, onTap: () => setState(() { _group = g; _subgroup = ''; }))),
        ],
      ),
    );
  }

  /// Подгруппы по таксономии группы (известные — в порядке, прочие — в конец).
  List<String> _orderedSubgroups(String group, Iterable<String> present) {
    final Set<String> set = present.where((String s) => s.isNotEmpty).toSet();
    final List<String> order = subgroupsFor(group);
    final List<String> ordered = order.where(set.contains).toList();
    final List<String> extras = set.where((String s) => !order.contains(s)).toList()..sort();
    return <String>[...ordered, ...extras];
  }

  Future<void> _openCreateTemplate() async {
    final bool? saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(builder: (_) => const TemplateEditScreen()),
    );
    if (saved == true && mounted) setState(() {});
  }

  /// Пустое состояние вкладки «Тренировки»: текст + неяркая пунктирная кнопка.
  Widget _emptyTemplates(AppColors c) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text('Пока нет тренировок. Создайте первую.',
                  textAlign: TextAlign.center, style: TextStyle(color: c.inkMuted)),
              const SizedBox(height: 20),
              _DashedAddButton(label: 'Добавить тренировку', onTap: _openCreateTemplate),
            ],
          ),
        ),
      );

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

/// Строка шаблона тренировки в базе знаний: свайп влево — [Дубль][Ред.][Удал.];
/// тап по стрелке (вниз) — раскрыть краткий состав; тап по остальному — открыть.
class _TemplateCard extends StatefulWidget {
  const _TemplateCard({
    super.key,
    required this.template,
    required this.onOpen,
    required this.onDuplicate,
    required this.onDelete,
  });
  final WorkoutTemplate template;
  final VoidCallback onOpen;
  final VoidCallback onDuplicate;
  final VoidCallback onDelete;

  @override
  State<_TemplateCard> createState() => _TemplateCardState();
}

class _TemplateCardState extends State<_TemplateCard> {
  bool _expanded = false;

  String _numStr(num v) => v % 1 == 0 ? v.toInt().toString() : v.toString();

  /// Основные параметры позиции: повторы/вес/время/отдых («10/10/0/90»),
  /// с префиксом «N× » при нескольких подходах.
  String _exSummary(TemplateExercise e) {
    final String params =
        '${_numStr(e.reps ?? 0)}/${_numStr(e.weightKg ?? 0)}/${_numStr(e.timeSec ?? 0)}/${_numStr(e.restSec ?? 0)}';
    return e.sets > 1 ? '${e.sets}× $params' : params;
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final WorkoutTemplate t = widget.template;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Slidable(
        key: ValueKey<String>('tpl-${t.id}'),
        // Свайп влево → дубль / редактировать / удалить (как в истории у клиента).
        endActionPane: ActionPane(
          motion: const DrawerMotion(),
          extentRatio: 0.62,
          children: <Widget>[
            SlidableAction(
              onPressed: (_) => widget.onDuplicate(),
              backgroundColor: c.accent,
              foregroundColor: c.accentOn,
              icon: Icons.copy_outlined,
              label: 'Дубль',
            ),
            SlidableAction(
              onPressed: (_) => widget.onOpen(),
              backgroundColor: c.cardElevated,
              foregroundColor: c.ink,
              icon: Icons.edit_outlined,
              label: 'Ред.',
            ),
            SlidableAction(
              onPressed: (_) => widget.onDelete(),
              backgroundColor: c.danger,
              foregroundColor: Colors.white,
              icon: Icons.delete_outline,
              label: 'Удал.',
            ),
          ],
        ),
        child: Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  // Тап по основной области — открыть шаблон.
                  Expanded(
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: widget.onOpen,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
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
                                  if (t.isPersonal && t.clientName?.isNotEmpty == true)
                                    Text('для: ${t.clientName}',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  // Тап по стрелке (вниз) — раскрыть/свернуть краткий состав.
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => setState(() => _expanded = !_expanded),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(4, 12, 14, 12),
                      child: Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(color: c.cardElevated, shape: BoxShape.circle),
                        child: Icon(
                            _expanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                            size: 18, color: c.inkMuted),
                      ),
                    ),
                  ),
                ],
              ),
              if (_expanded) _composition(c),
            ],
          ),
        ),
      ),
    );
  }

  /// Краткий состав шаблона (упражнение · сводка) — как в истории у клиента.
  Widget _composition(AppColors c) {
    final WorkoutTemplate t = widget.template;
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(border: Border(top: BorderSide(color: c.line))),
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
      child: t.exercises.isEmpty
          ? Text('Нет упражнений', style: TextStyle(fontSize: 12, color: c.inkMuted))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                for (final TemplateExercise e in t.exercises)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(
                      children: <Widget>[
                        Expanded(
                          child: Text(e.exerciseName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: c.ink)),
                        ),
                        const SizedBox(width: 8),
                        Text(_exSummary(e),
                            style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w600)),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }
}

/// Неяркая пунктирная кнопка добавления: пунктирная рамка + «+» и текст
/// приглушённым цветом (для пустых состояний).
class _DashedAddButton extends StatelessWidget {
  const _DashedAddButton({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: CustomPaint(
        painter: _DashedBorderPainter(color: c.line, radius: 16),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(Icons.add, size: 18, color: c.inkMuted),
              const SizedBox(width: 8),
              Text(label,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.inkMuted)),
            ],
          ),
        ),
      ),
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  _DashedBorderPainter({required this.color, required this.radius});
  final Color color;
  final double radius;
  @override
  void paint(Canvas canvas, Size size) {
    final Paint paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    final Path path = Path()
      ..addRRect(RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(radius)));
    const double dash = 6;
    const double gap = 4;
    for (final metric in path.computeMetrics()) {
      double dist = 0;
      while (dist < metric.length) {
        final double end = (dist + dash).clamp(0, metric.length).toDouble();
        canvas.drawPath(metric.extractPath(dist, end), paint);
        dist += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedBorderPainter old) => old.color != color || old.radius != radius;
}

/// Подпись карточки упражнения: категория + повторы/вес/время/отдых (как в вебе).
class _MetricsRow extends StatelessWidget {
  const _MetricsRow({required this.ex});
  final TExercise ex;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    Widget metric(IconData icon, num? v) => Padding(
          padding: const EdgeInsets.only(right: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(icon, size: 13, color: c.inkMutedXl),
              const SizedBox(width: 3),
              Text('${(v ?? 0).toInt()}', style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w600)),
            ],
          ),
        );
    return Row(
      children: <Widget>[
        if (ex.category.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(right: 10),
            child: Text(ex.category, style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w600)),
          ),
        Expanded(
          child: Row(
            children: <Widget>[
              metric(Icons.repeat, ex.defaultReps),
              metric(Icons.fitness_center, ex.defaultWeightKg),
              metric(Icons.timer_outlined, ex.defaultTimeSec),
              metric(Icons.bedtime_outlined, ex.restSec),
            ],
          ),
        ),
      ],
    );
  }
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

/// Кнопка сегмент-переключателя «Общие / Персональные»: равная по ширине
/// (в Expanded), нормальной высоты — не тонкий чип.
class _ScopeBtn extends StatelessWidget {
  const _ScopeBtn({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: active ? c.accent : c.chip, borderRadius: BorderRadius.circular(12)),
        child: Text(label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: active ? c.accentOn : c.inkMuted)),
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
