import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client_workouts.dart';
import '../stats/workout_stats.dart';

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
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final AsyncValue<List<Workout>> workouts = ref.watch(clientWorkoutsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('База знаний')),
      body: workouts.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => Center(
          child: FilledButton(
              onPressed: () => ref.invalidate(clientWorkoutsProvider), child: const Text('Повторить')),
        ),
        data: (List<Workout> all) {
          final List<ExerciseOverview> overview = aggregateExerciseOverview(all);
          final List<ExerciseOverview> list = _query.isEmpty
              ? overview
              : overview.where((ExerciseOverview e) => e.name.toLowerCase().contains(_query)).toList();
          return Column(
            children: <Widget>[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
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
                child: overview.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(
                            'Здесь появятся упражнения с ваших проведённых тренировок — с рекордами и историей.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: c.inkMuted),
                          ),
                        ),
                      )
                    : list.isEmpty
                        ? Center(child: Text('Ничего не найдено', style: TextStyle(color: c.inkMuted)))
                        : ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                            itemCount: list.length,
                            itemBuilder: (BuildContext ctx, int i) => _Row(
                              ex: list[i],
                              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                                  builder: (_) => ExerciseDetailScreen(exerciseId: list[i].exerciseId))),
                            ),
                          ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.ex, required this.onTap});
  final ExerciseOverview ex;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
        child: Row(
          children: <Widget>[
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
                      'PR ${_pr(ex)}',
                      if (ex.lastDate != null) _date(ex.lastDate),
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
