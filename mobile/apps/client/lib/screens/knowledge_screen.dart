import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client_auth.dart';
import '../api/client_workouts.dart';
import '../stats/workout_stats.dart';
import 'workouts_screen.dart' show WorkoutDetailScreen;

/// Порядок групп мышц для чипов (зеркало web GROUP_ORDER).
const List<String> _groupOrder = <String>[
  'Грудь', 'Спина', 'Ноги', 'Плечи', 'Руки', 'Корпус', 'Пресс/Кор', 'Кардио', 'Растяжка', 'Йога',
];

/// Подгруппы по группе (зеркало web SUBGROUPS_BY_GROUP). Группы без подгрупп отсутствуют.
const Map<String, List<String>> _subgroupsByGroup = <String, List<String>>{
  'Грудь': <String>['Верх', 'Середина', 'Низ'],
  'Спина': <String>['Широчайшие', 'Трапеции/верх', 'Поясница/низ'],
  'Ноги': <String>['Квадрицепс', 'Бицепс бедра', 'Ягодицы', 'Икры'],
  'Плечи': <String>['Передняя дельта', 'Средняя дельта', 'Задняя дельта'],
  'Руки': <String>['Бицепс', 'Трицепс', 'Предплечья'],
  'Пресс/Кор': <String>['Верх', 'Низ', 'Косые'],
  'Корпус': <String>['Верх', 'Низ', 'Косые'],
};

List<String> _orderedGroups(Iterable<String> present) {
  final Set<String> set = present.where((String s) => s.isNotEmpty).toSet();
  final List<String> ordered = _groupOrder.where(set.contains).toList();
  final List<String> extras = set.where((String s) => !_groupOrder.contains(s)).toList()..sort();
  return <String>[...ordered, ...extras];
}

/// Упорядочить подгруппы по таксономии группы (неизвестные — в конец по алфавиту).
List<String> _orderedSubgroups(String group, Iterable<String> present) {
  final Set<String> set = present.where((String s) => s.isNotEmpty).toSet();
  final List<String> order = _subgroupsByGroup[group] ?? const <String>[];
  final List<String> ordered = order.where(set.contains).toList();
  final List<String> extras = set.where((String s) => !order.contains(s)).toList()..sort();
  return <String>[...ordered, ...extras];
}

const List<String> _ruMonths = <String>[
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

/// «12 июн» — день + ru-месяц (зеркало web shortDate, без года).
String _date(DateTime? d) => d == null ? '' : '${d.day} ${_ruMonths[d.month - 1]}';


/// База знаний клиента — read-only зеркало тренерской: поиск, табы «Тренировки /
/// Упражнения», двухуровневые чипы (группа → подгруппа). Тренировки — проведённые
/// тренером; упражнения — с проведённых тренировок, обогащённые каталогом тренера.
class KnowledgeScreen extends ConsumerStatefulWidget {
  const KnowledgeScreen({super.key});
  @override
  ConsumerState<KnowledgeScreen> createState() => _KnowledgeScreenState();
}

class _KnowledgeScreenState extends ConsumerState<KnowledgeScreen> {
  bool _exercisesTab = false; // false → Тренировки (как в вебе по умолчанию)
  final TextEditingController _search = TextEditingController();
  String _query = '';
  String _group = '';
  String _subgroup = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _selectTab(bool exercises) =>
      setState(() { _exercisesTab = exercises; _group = ''; _subgroup = ''; });
  void _selectGroup(String g) => setState(() { _group = g; _subgroup = ''; });

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final AsyncValue<List<Workout>> workouts = ref.watch(clientWorkoutsProvider);
    final AsyncValue<List<CatalogExercise>> catalog = ref.watch(clientCatalogProvider);
    final bool linked = ref.watch(clientLinkedProvider).valueOrNull ?? false;
    final bool isLoading = workouts.isLoading || catalog.isLoading;
    final bool isError = workouts.hasError || catalog.hasError;

    return Scaffold(
      appBar: AppBar(title: const Text('База знаний')),
      body: Column(
        children: <Widget>[
          // Поиск.
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              controller: _search,
              onChanged: (String v) => setState(() => _query = v.trim().toLowerCase()),
              decoration: InputDecoration(
                hintText: 'Поиск тренировок, упражнений',
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: _query.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.close, size: 18),
                        tooltip: 'Очистить',
                        onPressed: () => setState(() { _search.clear(); _query = ''; }),
                      ),
                filled: true,
                fillColor: c.card,
                isDense: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
              ),
            ),
          ),
          // Сегмент-табы.
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
              child: Row(
                children: <Widget>[
                  _Seg(label: 'Тренировки', active: !_exercisesTab, onTap: () => _selectTab(false)),
                  _Seg(label: 'Упражнения', active: _exercisesTab, onTap: () => _selectTab(true)),
                ],
              ),
            ),
          ),
          Expanded(
            child: isLoading
                ? const Center(child: CircularProgressIndicator())
                : isError
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(
                            'Не удалось загрузить. Попробуйте обновить.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: c.inkMuted),
                          ),
                        ),
                      )
                    : _exercisesTab
                        ? _buildExercises(c, workouts.valueOrNull ?? <Workout>[], catalog.valueOrNull ?? <CatalogExercise>[], linked)
                        : _buildWorkouts(c, workouts.valueOrNull ?? <Workout>[], catalog.valueOrNull ?? <CatalogExercise>[], linked),
          ),
        ],
      ),
    );
  }

  Map<String, CatalogExercise> _catalogMap(List<CatalogExercise> catalog) =>
      <String, CatalogExercise>{for (final CatalogExercise e in catalog) e.id: e};

  Widget _buildExercises(AppColors c, List<Workout> all, List<CatalogExercise> catalog, bool linked) {
    final String base = ref.read(baseUrlProvider);
    final Map<String, CatalogExercise> cat = _catalogMap(catalog);
    final List<ExerciseOverview> overview = aggregateExerciseOverview(all);

    final List<String> groups = _orderedGroups(
        overview.map((ExerciseOverview e) => cat[e.exerciseId]?.category ?? ''));
    final List<String> subgroups = _group.isEmpty
        ? const <String>[]
        : _orderedSubgroups(
            _group,
            overview
                .where((ExerciseOverview e) => (cat[e.exerciseId]?.category ?? '') == _group)
                .map((ExerciseOverview e) => cat[e.exerciseId]?.subgroup ?? ''));

    final List<ExerciseOverview> filtered = overview.where((ExerciseOverview e) {
      final CatalogExercise? ce = cat[e.exerciseId];
      if (_group.isNotEmpty && (ce?.category ?? '') != _group) return false;
      if (_subgroup.isNotEmpty && (ce?.subgroup ?? '') != _subgroup) return false;
      return true;
    }).toList();
    // Релевантный поиск как в вебе (ё→е, слова в любом порядке, опечатки, ранжирование).
    final List<ExerciseOverview> list =
        rankBySearch(filtered, _query, (ExerciseOverview e) => e.name);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _groupChips(c, groups),
        _subgroupChips(c, subgroups),
        Expanded(
          child: list.isEmpty
              ? _empty(
                  c,
                  overview.isEmpty
                      ? (linked
                          ? 'Пока нет упражнений из проведённых тренировок.'
                          : 'Подключите тренера — здесь появятся упражнения с ваших тренировок.')
                      : 'Ничего не нашлось.',
                )
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                  itemCount: list.length,
                  itemBuilder: (BuildContext ctx, int i) {
                    final ExerciseOverview ex = list[i];
                    final CatalogExercise? ce = cat[ex.exerciseId];
                    return _ExRow(
                      ex: ex,
                      cat: ce,
                      thumbUrl: catalogMediaUrl(base, ce?.thumbUrl ?? ce?.imageUrl),
                      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                          builder: (_) => ExerciseDetailScreen(exerciseId: ex.exerciseId))),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildWorkouts(AppColors c, List<Workout> all, List<CatalogExercise> catalog, bool linked) {
    final Map<String, CatalogExercise> cat = _catalogMap(catalog);
    final List<Workout> done = all
        .where((Workout w) => w.status == WorkoutStatus.completed && !w.createdByClient)
        .toList()
      ..sort((Workout a, Workout b) => (b.completedAt ?? DateTime(0)).compareTo(a.completedAt ?? DateTime(0)));

    // Группы/подгруппы тренировки — из каталога по exerciseId каждого упражнения.
    final List<String> groups = _orderedGroups(<String>[
      for (final Workout w in done)
        for (final WorkoutExercise ex in w.exercises) cat[ex.exerciseId]?.category ?? '',
    ]);
    final List<String> subgroups = _group.isEmpty
        ? const <String>[]
        : _orderedSubgroups(_group, <String>[
            for (final Workout w in done)
              for (final WorkoutExercise ex in w.exercises)
                if ((cat[ex.exerciseId]?.category ?? '') == _group) cat[ex.exerciseId]?.subgroup ?? '',
          ]);

    final List<Workout> filtered = done.where((Workout w) {
      if (_group.isNotEmpty) {
        final bool inGroup = w.exercises.any((WorkoutExercise ex) {
          final CatalogExercise? ce = cat[ex.exerciseId];
          if ((ce?.category ?? '') != _group) return false;
          if (_subgroup.isEmpty) return true;
          final String sg = ce?.subgroup ?? '';
          return sg.isEmpty || sg == _subgroup;
        });
        if (!inGroup) return false;
      }
      return true;
    }).toList();
    final List<Workout> list = rankBySearch(filtered, _query, (Workout w) => w.name);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _groupChips(c, groups),
        _subgroupChips(c, subgroups),
        Expanded(
          child: list.isEmpty
              ? _empty(
                  c,
                  done.isEmpty
                      ? (linked
                          ? 'Пока нет тренировок от тренера.'
                          : 'Подключите тренера — здесь появятся проведённые им тренировки.')
                      : 'Ничего не нашлось.',
                )
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                  itemCount: list.length,
                  itemBuilder: (BuildContext ctx, int i) {
                    final Workout w = list[i];
                    return GestureDetector(
                      onTap: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(builder: (_) => WorkoutDetailScreen(workout: w))),
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
                        child: Row(
                          children: <Widget>[
                            Container(
                              width: 38,
                              height: 38,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(color: c.chip, shape: BoxShape.circle),
                              child: Text('${w.exercises.length}',
                                  style: AppFonts.mono(size: 15, color: c.ink, weight: FontWeight.w700)),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  Text(w.name,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                                  Text(
                                      <String>[
                                        if (w.completedAt != null) _date(w.completedAt),
                                        '${w.exercises.length} упр.',
                                      ].join(' · '),
                                      style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
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
  }

  Widget _groupChips(AppColors c, List<String> groups) {
    if (groups.isEmpty) return const SizedBox(height: 4);
    return SizedBox(
      height: 40,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: <Widget>[
          _Chip(label: 'Все', active: _group.isEmpty, onTap: () => _selectGroup('')),
          ...groups.map((String g) => _Chip(label: g, active: _group == g, onTap: () => _selectGroup(g))),
        ],
      ),
    );
  }

  Widget _subgroupChips(AppColors c, List<String> subgroups) {
    if (_group.isEmpty || subgroups.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 38,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: <Widget>[
          _Chip(label: 'Все', active: _subgroup.isEmpty, onTap: () => setState(() => _subgroup = '')),
          ...subgroups
              .map((String s) => _Chip(label: s, active: _subgroup == s, onTap: () => setState(() => _subgroup = s))),
        ],
      ),
    );
  }

  Widget _empty(AppColors c, String text) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(text, textAlign: TextAlign.center, style: TextStyle(color: c.inkMuted)),
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
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: active ? c.accentOn : c.inkMuted)),
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

/// Карточка упражнения — один-в-один с тренерской (thumb 64 + имя + метрики).
class _ExRow extends StatelessWidget {
  const _ExRow({required this.ex, required this.cat, required this.thumbUrl, required this.onTap});
  final ExerciseOverview ex;
  final CatalogExercise? cat;
  final String? thumbUrl;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(10, 8, 12, 8),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
        child: Row(
          children: <Widget>[
            CatalogThumb(url: thumbUrl, size: 64, radius: 10),
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
                  _CatMetrics(cat: cat),
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

/// Подпись карточки: категория + повторы/вес/время/отдых (зеркало тренерского
/// _MetricsRow). Значения берём из каталога; если упражнения нет — пусто.
class _CatMetrics extends StatelessWidget {
  const _CatMetrics({required this.cat});
  final CatalogExercise? cat;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final CatalogExercise? ex = cat;
    Widget metric(IconData icon, num? v) => Padding(
          padding: const EdgeInsets.only(right: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(icon, size: 13, color: c.inkMutedXl),
              const SizedBox(width: 3),
              Text('${(v ?? 0).toInt()}',
                  style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w600)),
            ],
          ),
        );
    return Row(
      children: <Widget>[
        if (ex?.category.isNotEmpty == true)
          Padding(
            padding: const EdgeInsets.only(right: 10),
            child: Text(ex!.category,
                style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w600)),
          ),
        Expanded(
          child: Row(
            children: <Widget>[
              metric(Icons.repeat, ex?.defaultReps),
              metric(Icons.fitness_center, ex?.defaultWeightKg),
              metric(Icons.timer_outlined, ex?.defaultTimeSec),
              metric(Icons.bedtime_outlined, ex?.restSec),
            ],
          ),
        ),
      ],
    );
  }
}

/// Read-only деталь упражнения: описание и параметры из каталога тренера + личный
/// результат клиента (PR + дата последней). Графика истории и медиа НЕ показываются.
class ExerciseDetailScreen extends ConsumerWidget {
  const ExerciseDetailScreen({super.key, required this.exerciseId});
  final String exerciseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<List<Workout>> workouts = ref.watch(clientWorkoutsProvider);
    final AsyncValue<List<CatalogExercise>> catalog = ref.watch(clientCatalogProvider);
    final bool isLoading = workouts.isLoading || catalog.isLoading;

    return Scaffold(
      appBar: AppBar(title: const Text('Упражнение')),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : _body(c, ref.read(baseUrlProvider), workouts.valueOrNull ?? <Workout>[],
              catalog.valueOrNull ?? <CatalogExercise>[]),
    );
  }

  Widget _body(AppColors c, String base, List<Workout> all, List<CatalogExercise> catalog) {
    CatalogExercise? entry;
    for (final CatalogExercise e in catalog) {
      if (e.id == exerciseId) {
        entry = e;
        break;
      }
    }
    ExerciseOverview? overview;
    for (final ExerciseOverview o in aggregateExerciseOverview(all)) {
      if (o.exerciseId == exerciseId) {
        overview = o;
        break;
      }
    }

    final String name = entry?.name.isNotEmpty == true ? entry!.name : (overview?.name ?? 'Упражнение');
    final String category = entry?.category ?? '';
    final String subgroup = entry?.subgroup ?? '';
    final String subtitle = <String>[
      if (category.isNotEmpty) category,
      if (subgroup.isNotEmpty) subgroup,
    ].join(' · ');
    final String? description = entry?.description;
    final List<({String label, String value})> params = _paramRows(entry);
    final String? img = catalogMediaUrl(base, entry?.imageUrl ?? entry?.thumbUrl);
    final String? vid = catalogMediaUrl(base, entry?.videoUrl);
    final bool hasMedia = (img != null && img.isNotEmpty) || (vid != null && vid.isNotEmpty);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: <Widget>[
        // Заголовок.
        Text(name, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: c.ink)),
        if (subtitle.isNotEmpty) ...<Widget>[
          const SizedBox(height: 4),
          Text(subtitle, style: TextStyle(fontSize: 13, color: c.inkMuted)),
        ],
        // Медиа (фото/видео из каталога), как у тренера.
        if (hasMedia) ...<Widget>[
          const SizedBox(height: 16),
          CatalogMediaView(imageUrl: img, videoUrl: vid, height: 200, showToggle: true),
        ],
        // Описание.
        const SizedBox(height: 20),
        _kicker(c, 'ОПИСАНИЕ'),
        const SizedBox(height: 6),
        Text(
          (description != null && description.isNotEmpty) ? description : 'Описание не задано',
          style: TextStyle(fontSize: 14, color: c.ink, height: 1.4),
        ),
        // Параметры.
        if (params.isNotEmpty) ...<Widget>[
          const SizedBox(height: 20),
          _kicker(c, 'ПАРАМЕТРЫ'),
          const SizedBox(height: 6),
          _infoCard(c, <Widget>[
            for (int i = 0; i < params.length; i++) ...<Widget>[
              if (i > 0) const SizedBox(height: 6),
              _row(c, params[i].label, params[i].value),
            ],
          ]),
        ],
        // Оборудование / мышцы (как у тренера).
        if (entry?.equipment?.isNotEmpty == true) ...<Widget>[
          const SizedBox(height: 20),
          _kicker(c, 'ОБОРУДОВАНИЕ'),
          const SizedBox(height: 6),
          Text(entry!.equipment!, style: TextStyle(fontSize: 14, color: c.ink, height: 1.4)),
        ],
        if (entry?.primaryMuscles?.isNotEmpty == true) ...<Widget>[
          const SizedBox(height: 20),
          _kicker(c, 'МЫШЦЫ'),
          const SizedBox(height: 6),
          Text(entry!.primaryMuscles!, style: TextStyle(fontSize: 14, color: c.ink, height: 1.4)),
        ],
        // Ваш результат.
        if (overview != null) ...<Widget>[
          const SizedBox(height: 20),
          _kicker(c, 'ВАШ РЕЗУЛЬТАТ'),
          const SizedBox(height: 6),
          _infoCard(c, <Widget>[
            if (overview.isTimeBased && overview.maxTimeSec != null)
              _row(c, 'PR время', '${overview.maxTimeSec} сек')
            else if (!overview.isTimeBased && overview.maxWeightKg != null)
              _row(c, 'PR вес', '${overview.maxWeightKg} кг'),
            if (overview.lastDate != null) ...<Widget>[
              const SizedBox(height: 6),
              _row(c, 'Последняя тренировка', _date(overview.lastDate)),
            ],
          ]),
        ],
      ],
    );
  }

  /// Параметры из каталога — только заданные положительные значения (зеркало paramRows).
  List<({String label, String value})> _paramRows(CatalogExercise? e) {
    if (e == null) return const <({String label, String value})>[];
    final List<({String label, String value})> rows = <({String label, String value})>[];
    if ((e.defaultReps ?? 0) > 0) rows.add((label: 'Повторы', value: '${e.defaultReps}'));
    if ((e.defaultWeightKg ?? 0) > 0) rows.add((label: 'Вес', value: '${e.defaultWeightKg} кг'));
    if ((e.defaultTimeSec ?? 0) > 0) rows.add((label: 'Время', value: '${e.defaultTimeSec} сек'));
    if ((e.restSec ?? 0) > 0) rows.add((label: 'Отдых', value: '${e.restSec} сек'));
    return rows;
  }

  Widget _kicker(AppColors c, String text) => Text(
        text,
        style: AppFonts.mono(size: 11, color: c.inkMuted, weight: FontWeight.w600).copyWith(letterSpacing: 0.5),
      );

  Widget _infoCard(AppColors c, List<Widget> children) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
      );

  Widget _row(AppColors c, String label, String value) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Expanded(child: Text(label, style: TextStyle(fontSize: 14, color: c.inkMuted))),
          const SizedBox(width: 12),
          Text(value, style: AppFonts.mono(size: 14, color: c.ink)),
        ],
      );
}
