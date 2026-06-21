import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client_workouts.dart';
import '../stats/workout_stats.dart';
import 'workouts_screen.dart' show WorkoutDetailScreen;

/// Порядок групп мышц для чипов (зеркало web GROUP_ORDER).
const List<String> _groupOrder = <String>[
  'Грудь', 'Спина', 'Ноги', 'Плечи', 'Руки', 'Корпус', 'Пресс/Кор', 'Кардио', 'Растяжка', 'Йога',
];

List<String> _orderedGroups(Iterable<String> present) {
  final Set<String> set = present.where((String s) => s.isNotEmpty).toSet();
  final List<String> ordered = _groupOrder.where(set.contains).toList();
  final List<String> extras = set.where((String s) => !_groupOrder.contains(s)).toList()..sort();
  return <String>[...ordered, ...extras];
}

const List<String> _ruMonths = <String>[
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];
String _date(DateTime? d) {
  if (d == null) return '';
  final DateTime now = DateTime.now();
  final String base = '${d.day} ${_ruMonths[d.month - 1]}';
  return d.year == now.year ? base : '$base ${d.year}';
}

String _pr(ExerciseOverview e) {
  if (e.isTimeBased) return e.maxTimeSec != null ? '${e.maxTimeSec} с' : '—';
  return e.maxWeightKg != null ? '${e.maxWeightKg} кг' : '—';
}

/// База знаний: упражнения с проведённых тренировок, их рекорды и история.
class KnowledgeScreen extends ConsumerStatefulWidget {
  const KnowledgeScreen({super.key});
  @override
  ConsumerState<KnowledgeScreen> createState() => _KnowledgeScreenState();
}

class _KnowledgeScreenState extends ConsumerState<KnowledgeScreen> {
  bool _exercisesTab = true; // true → Упражнения, false → Тренировки
  String _query = '';
  String _group = '';

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final AsyncValue<List<Workout>> workouts = ref.watch(clientWorkoutsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('База знаний')),
      body: Column(
        children: <Widget>[
          // Переключатель вкладок.
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
              child: Row(
                children: <Widget>[
                  _Seg(label: 'Тренировки', active: !_exercisesTab, onTap: () => setState(() { _exercisesTab = false; _group = ''; })),
                  _Seg(label: 'Упражнения', active: _exercisesTab, onTap: () => setState(() { _exercisesTab = true; _group = ''; })),
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
          Expanded(
            child: workouts.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (Object e, _) => Center(
                child: FilledButton(
                    onPressed: () => ref.invalidate(clientWorkoutsProvider), child: const Text('Повторить')),
              ),
              data: (List<Workout> all) => _exercisesTab ? _buildExercises(c, all) : _buildWorkouts(c, all),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildExercises(AppColors c, List<Workout> all) {
    final String base = ref.read(baseUrlProvider);
    final Map<String, CatalogExercise> cat = <String, CatalogExercise>{
      for (final CatalogExercise e in ref.watch(clientCatalogProvider).valueOrNull ?? <CatalogExercise>[]) e.id: e,
    };
    final List<ExerciseOverview> overview = aggregateExerciseOverview(all)
      ..sort((ExerciseOverview a, ExerciseOverview b) =>
          (b.lastDate ?? DateTime(0)).compareTo(a.lastDate ?? DateTime(0)));
    if (overview.isEmpty) {
      return _empty(c, 'Здесь появятся упражнения с ваших проведённых тренировок — с рекордами и историей.');
    }
    final List<String> groups = _orderedGroups(
        overview.map((ExerciseOverview e) => cat[e.exerciseId]?.category ?? ''));
    final List<ExerciseOverview> list = overview.where((ExerciseOverview e) {
      final CatalogExercise? ce = cat[e.exerciseId];
      if (_group.isNotEmpty && (ce?.category ?? '') != _group) return false;
      if (_query.isNotEmpty && !e.name.toLowerCase().contains(_query)) return false;
      return true;
    }).toList();
    return Column(
      children: <Widget>[
        _groupChips(c, groups),
        Expanded(
          child: list.isEmpty
              ? Center(child: Text('Ничего не найдено', style: TextStyle(color: c.inkMuted)))
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                  itemCount: list.length,
                  itemBuilder: (BuildContext ctx, int i) {
                    final ExerciseOverview ex = list[i];
                    final CatalogExercise? ce = cat[ex.exerciseId];
                    return _ExRow(
                      ex: ex,
                      thumbUrl: catalogMediaUrl(base, ce?.thumbUrl ?? ce?.imageUrl),
                      subtitle: <String>[
                        if (ce?.category.isNotEmpty == true) ce!.category,
                        if (ce?.subgroup?.isNotEmpty == true) ce!.subgroup!,
                      ].join(' · '),
                      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                          builder: (_) => ExerciseDetailScreen(exerciseId: ex.exerciseId))),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildWorkouts(AppColors c, List<Workout> all) {
    final List<Workout> done = all
        .where((Workout w) => w.status == WorkoutStatus.completed && !w.createdByClient)
        .toList()
      ..sort((Workout a, Workout b) => (b.completedAt ?? DateTime(0)).compareTo(a.completedAt ?? DateTime(0)));
    final List<Workout> list = _query.isEmpty
        ? done
        : done.where((Workout w) => w.name.toLowerCase().contains(_query)).toList();
    if (done.isEmpty) {
      return _empty(c, 'Здесь появятся тренировки, которые вы провели по плану тренера.');
    }
    if (list.isEmpty) return Center(child: Text('Ничего не найдено', style: TextStyle(color: c.inkMuted)));
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
      itemCount: list.length,
      itemBuilder: (BuildContext ctx, int i) {
        final Workout w = list[i];
        return GestureDetector(
          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => WorkoutDetailScreen(workout: w))),
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
                  child: Text('${w.exercises.length}', style: AppFonts.mono(size: 15, color: c.ink, weight: FontWeight.w700)),
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
                      Text(<String>[if (w.completedAt != null) _date(w.completedAt), '${w.exercises.length} упр.'].join(' · '),
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

class _ExRow extends StatelessWidget {
  const _ExRow({required this.ex, required this.thumbUrl, required this.subtitle, required this.onTap});
  final ExerciseOverview ex;
  final String? thumbUrl;
  final String subtitle;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
        child: Row(
          children: <Widget>[
            CatalogThumb(url: thumbUrl, size: 48),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      Flexible(
                        child: Text(ex.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                      ),
                      if (ex.lastIsRecord) ...<Widget>[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                              color: c.accent.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(6)),
                          child: Text('Рекорд',
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: c.accent)),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    <String>[
                      if (subtitle.isNotEmpty) subtitle,
                      'PR ${_pr(ex)}',
                      if (ex.lastDate != null) _date(ex.lastDate),
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
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
  }
}

/// Деталь упражнения: история по сессиям (дата, подходы, рекорд, тоннаж).
class ExerciseDetailScreen extends ConsumerWidget {
  const ExerciseDetailScreen({super.key, required this.exerciseId});
  final String exerciseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<List<Workout>> workouts = ref.watch(clientWorkoutsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Упражнение')),
      body: workouts.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => const Center(child: Text('Не удалось загрузить')),
        data: (List<Workout> all) {
          final ExerciseHistory? h = aggregateExerciseHistory(all, exerciseId);
          if (h == null) {
            return Center(child: Text('История пуста', style: TextStyle(color: c.inkMuted)));
          }
          final num best = h.isTimeBased
              ? h.points.fold<num>(0, (num a, ExerciseHistoryPoint p) => (p.maxTimeSec ?? 0) > a ? (p.maxTimeSec ?? 0) : a)
              : h.points.fold<num>(0, (num a, ExerciseHistoryPoint p) => (p.maxWeightKg ?? 0) > a ? (p.maxWeightKg ?? 0) : a);
          final List<ExerciseHistoryPoint> recent = h.points.reversed.toList();
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: <Widget>[
              Text(h.name, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: c.ink)),
              const SizedBox(height: 4),
              Text('${recent.length} ${_plural(recent.length)} · рекорд $best ${h.isTimeBased ? 'с' : 'кг'}',
                  style: TextStyle(color: c.inkMuted)),
              const SizedBox(height: 16),
              ...recent.map((ExerciseHistoryPoint p) {
                final bool isRecord = h.isTimeBased
                    ? (p.maxTimeSec ?? 0) >= best && best > 0
                    : (p.maxWeightKg ?? 0) >= best && best > 0;
                final String value = h.isTimeBased
                    ? (p.maxTimeSec != null ? '${p.maxTimeSec} с' : '—')
                    : (p.maxWeightKg != null
                        ? '${p.topReps != null ? '${p.topReps} × ' : ''}${p.maxWeightKg} кг'
                        : '—');
                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
                  child: Row(
                    children: <Widget>[
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(_date(p.date), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
                            Text('${p.totalSets} подх.${p.tonnage > 0 ? ' · ${p.tonnage} кг тоннаж' : ''}',
                                style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
                          ],
                        ),
                      ),
                      Text(value, style: AppFonts.mono(size: 15, color: c.ink)),
                      if (isRecord) ...<Widget>[
                        const SizedBox(width: 8),
                        Icon(Icons.emoji_events, size: 16, color: c.accent),
                      ],
                    ],
                  ),
                );
              }),
            ],
          );
        },
      ),
    );
  }

  String _plural(int n) {
    final int m10 = n % 10;
    final int m100 = n % 100;
    if (m10 == 1 && m100 != 11) return 'сессия';
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'сессии';
    return 'сессий';
  }
}
