import 'dart:async';
import 'dart:math' as math;

import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../api/client_auth.dart';
import '../api/client_measurements.dart';
import '../api/client_photos.dart';
import '../api/client_workouts.dart';
import '../stats/workout_stats.dart';

const List<String> _ruMonths = <String>[
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

String _shortDate(DateTime? d) => d == null ? '' : '${d.day} ${_ruMonths[d.month - 1]}';
String _fullDate(DateTime? d) =>
    d == null ? '—' : '${d.day} ${_ruMonths[d.month - 1]} ${d.year}';
String _iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Тоннаж: ≥1000 кг → «N,N т», иначе «N кг».
String _formatTonnage(num kg) {
  if (kg >= 1000) return '${(kg / 1000).toStringAsFixed(1).replaceAll('.', ',')} т';
  return '${kg.round()} кг';
}

/// Краткое относительное время: «сегодня/вчера/N дн назад…».
String _relative(DateTime? d) {
  if (d == null) return '';
  final int days = DateTime.now().difference(d).inDays;
  if (days <= 0) return 'сегодня';
  if (days == 1) return 'вчера';
  if (days < 7) return '$days дн назад';
  if (days < 30) return '${days ~/ 7} нед назад';
  if (days < 365) return '${days ~/ 30} мес назад';
  return '${days ~/ 365} г назад';
}

/// Время: суммарное «Nч NNм / N:SS / Nс» (для истории/детализации).
String _seconds(num sec) {
  final int s = sec.round();
  if (s >= 3600) {
    final int h = s ~/ 3600;
    final int m = (s % 3600) ~/ 60;
    return '$h'
        'ч ${m.toString().padLeft(2, '0')}м';
  }
  if (s >= 60) {
    final int m = s ~/ 60;
    return '$m:${(s % 60).toString().padLeft(2, '0')}';
  }
  return '$s'
      'с';
}

enum _Tab { exercises, measure, photos }

/// Прогресс клиента в трёх вкладках: упражнения (PR/тоннаж/тренд + детализация
/// с графиками и историей), замеры тела (аналитика-графики + список + форма) и
/// фото прогресса по ракурсам (с силуэтным гидом).
class ProgressScreen extends ConsumerStatefulWidget {
  const ProgressScreen({super.key, this.initialTab});

  /// Стартовая вкладка для глубоких ссылок (например `measurements` из задачи
  /// тренера на замеры). По умолчанию — «Упражнения».
  final String? initialTab;

  @override
  ConsumerState<ProgressScreen> createState() => _ProgressScreenState();
}

class _ProgressScreenState extends ConsumerState<ProgressScreen> {
  late _Tab _tab = switch (widget.initialTab) {
    'measurements' || 'measure' => _Tab.measure,
    'photos' => _Tab.photos,
    _ => _Tab.exercises,
  };

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Scaffold(
      appBar: AppBar(title: const Text('Прогресс')),
      body: Column(
        children: <Widget>[
          // Верхний переключатель вкладок.
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(color: c.chip, borderRadius: BorderRadius.circular(14)),
              child: Row(
                children: <Widget>[
                  _Seg(label: 'Упражнения', active: _tab == _Tab.exercises, onTap: () => setState(() => _tab = _Tab.exercises)),
                  _Seg(label: 'Замеры', active: _tab == _Tab.measure, onTap: () => setState(() => _tab = _Tab.measure)),
                  _Seg(label: 'Фото', active: _tab == _Tab.photos, onTap: () => setState(() => _tab = _Tab.photos)),
                ],
              ),
            ),
          ),
          Expanded(child: _body(c)),
        ],
      ),
    );
  }

  Widget _body(AppColors c) {
    final bool linked = ref.watch(clientLinkedProvider).valueOrNull ?? false;
    switch (_tab) {
      case _Tab.exercises:
        return _ExercisesTab(linked: linked);
      case _Tab.measure:
        return _MeasurementsTab(linked: linked);
      case _Tab.photos:
        return _PhotosTab(linked: linked);
    }
  }
}

// ─── Общие мелочи ─────────────────────────────────────────────────────────────

Widget _emptyState(BuildContext context, IconData icon, String text) {
  final AppColors c = context.colors;
  return Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 30, color: c.inkMuted),
          const SizedBox(height: 12),
          Text(text, textAlign: TextAlign.center, style: TextStyle(color: c.inkMuted, fontSize: 14)),
        ],
      ),
    ),
  );
}

Widget _retry(BuildContext context, VoidCallback onRetry, String text) {
  final AppColors c = context.colors;
  return Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Text(text, textAlign: TextAlign.center, style: TextStyle(color: c.inkMuted)),
        const SizedBox(height: 12),
        FilledButton(onPressed: onRetry, child: const Text('Повторить')),
      ],
    ),
  );
}

// ─── Вкладка «Упражнения» ─────────────────────────────────────────────────────

class _ExercisesTab extends ConsumerStatefulWidget {
  const _ExercisesTab({required this.linked});
  final bool linked;
  @override
  ConsumerState<_ExercisesTab> createState() => _ExercisesTabState();
}

class _ExercisesTabState extends ConsumerState<_ExercisesTab> {
  ({String id, String name})? _selected;

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<Workout>> workouts = ref.watch(clientWorkoutsProvider);
    return workouts.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (Object e, _) => _retry(
          context, () => ref.invalidate(clientWorkoutsProvider), 'Не удалось загрузить прогресс.'),
      data: (List<Workout> all) {
        final ({String id, String name})? sel = _selected;
        if (sel != null) {
          final ExerciseHistory? history = aggregateExerciseHistory(all, sel.id);
          return _ExerciseDetail(
            name: sel.name,
            history: history,
            onBack: () => setState(() => _selected = null),
          );
        }

        final List<ExerciseOverview> items = aggregateExerciseOverview(all);
        if (items.isEmpty) {
          return _emptyState(
            context,
            Icons.fitness_center,
            widget.linked
                ? 'Тренировок с упражнениями пока нет.'
                : 'Вы пока не подключены к тренеру. Подключите его, чтобы здесь появился прогресс по упражнениям.',
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          itemCount: items.length,
          separatorBuilder: (_, _) => const SizedBox(height: 8),
          itemBuilder: (BuildContext ctx, int i) => _ExerciseRow(
            ex: items[i],
            onOpen: () => setState(() => _selected = (id: items[i].exerciseId, name: items[i].name)),
          ),
        );
      },
    );
  }
}

class _ExerciseRow extends StatelessWidget {
  const _ExerciseRow({required this.ex, required this.onOpen});
  final ExerciseOverview ex;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final List<String> metrics = <String>[
      if (ex.isTimeBased) ...<String>[
        if (ex.maxTimeSec != null) 'PR ${_seconds(ex.maxTimeSec!)}',
      ] else ...<String>[
        if (ex.maxWeightKg != null) 'PR ${ex.maxWeightKg} кг',
        if (ex.tonnageKg > 0) 'тоннаж ${_formatTonnage(ex.tonnageKg)}',
      ],
      if (ex.lastDate != null) '· ${_relative(ex.lastDate)}',
    ];
    return Material(
      color: c.card,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(ex.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                    const SizedBox(height: 4),
                    Text(metrics.join('  '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(ex.lastIsRecord ? Icons.arrow_upward : Icons.arrow_downward,
                  size: 18, color: ex.lastIsRecord ? c.accent : c.inkMutedXl),
              Icon(Icons.chevron_right, size: 20, color: c.inkMutedXl),
            ],
          ),
        ),
      ),
    );
  }
}

class _ExerciseDetail extends StatefulWidget {
  const _ExerciseDetail({required this.name, required this.history, required this.onBack});
  final String name;
  final ExerciseHistory? history;
  final VoidCallback onBack;
  @override
  State<_ExerciseDetail> createState() => _ExerciseDetailState();
}

class _ExerciseDetailState extends State<_ExerciseDetail> {
  bool _recordsOnly = true;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final ExerciseHistory? h = widget.history;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      children: <Widget>[
        Row(
          children: <Widget>[
            GestureDetector(
              onTap: widget.onBack,
              behavior: HitTestBehavior.opaque,
              child: Padding(
                padding: const EdgeInsets.only(right: 12, top: 4, bottom: 4),
                child: Text('← Назад',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.inkMuted)),
              ),
            ),
            Expanded(
              child: Text(widget.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: c.ink)),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (h == null || h.points.isEmpty)
          _emptyState(context, Icons.fitness_center,
              'Это упражнение пока не встречалось в проведённых тренировках.')
        else ...<Widget>[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
            child: Row(
              children: <Widget>[
                Expanded(
                  child: Text('Только рекорды',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
                ),
                Switch(
                  value: _recordsOnly,
                  onChanged: (bool v) => setState(() => _recordsOnly = v),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (h.isTimeBased) ...<Widget>[
            _ChartCard(
              title: 'Максимальное время',
              suffix: 'с',
              color: c.accent,
              recordsOnly: _recordsOnly,
              points: <({DateTime? date, num value})>[
                for (final ExerciseHistoryPoint p in h.points)
                  (date: p.date, value: p.maxTimeSec ?? 0),
              ],
              formatValue: _seconds,
            ),
            const SizedBox(height: 12),
            _ChartCard(
              title: 'Суммарное время',
              suffix: 'с',
              color: c.coral,
              recordsOnly: _recordsOnly,
              points: <({DateTime? date, num value})>[
                for (final ExerciseHistoryPoint p in h.points) (date: p.date, value: p.totalTimeSec),
              ],
              formatValue: _seconds,
            ),
          ] else ...<Widget>[
            _ChartCard(
              title: 'Тоннаж',
              suffix: 'кг',
              color: c.accent,
              recordsOnly: _recordsOnly,
              points: <({DateTime? date, num value})>[
                for (final ExerciseHistoryPoint p in h.points) (date: p.date, value: p.tonnage),
              ],
            ),
            const SizedBox(height: 12),
            _ChartCard(
              title: 'Максимальный вес',
              suffix: 'кг',
              color: c.coral,
              recordsOnly: _recordsOnly,
              points: <({DateTime? date, num value})>[
                for (final ExerciseHistoryPoint p in h.points)
                  (date: p.date, value: p.maxWeightKg ?? 0),
              ],
            ),
          ],
          const SizedBox(height: 16),
          _SectionLabel('История'),
          _HistoryTable(points: h.points, isTimeBased: h.isTimeBased),
        ],
      ],
    );
  }
}

/// Точка для интерактивного графика детализации.
typedef _ChartPoint = ({DateTime? date, num value});

/// Интерактивный line-график с курсором («тяни по графику»), крупным числом
/// под курсором и дельтой к первой сессии (зелёная при росте, danger при падении).
class _ChartCard extends StatefulWidget {
  const _ChartCard({
    required this.title,
    required this.suffix,
    required this.color,
    required this.points,
    required this.recordsOnly,
    this.formatValue,
  });
  final String title;
  final String suffix;
  final Color color;
  final List<_ChartPoint> points;
  final bool recordsOnly;
  final String Function(num)? formatValue;

  @override
  State<_ChartCard> createState() => _ChartCardState();
}

class _ChartCardState extends State<_ChartCard> {
  int? _activeIdx;

  List<({DateTime date, num value})> get _data {
    final List<({DateTime date, num value})> cleaned = <({DateTime date, num value})>[
      for (final _ChartPoint p in widget.points)
        if (p.date != null && p.value > 0) (date: p.date!, value: p.value),
    ];
    if (!widget.recordsOnly) return cleaned;
    num maxSoFar = double.negativeInfinity;
    final List<({DateTime date, num value})> out = <({DateTime date, num value})>[];
    for (final ({DateTime date, num value}) p in cleaned) {
      if (p.value > maxSoFar) {
        maxSoFar = p.value;
        out.add(p);
      }
    }
    return out;
  }

  String _fmt(num v) => widget.formatValue != null
      ? widget.formatValue!(v)
      : '${(v % 1 == 0) ? v.toInt() : (v * 10).round() / 10}';

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final List<({DateTime date, num value})> data = _data;
    if (data.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(widget.title,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.ink)),
            const SizedBox(height: 8),
            Text('Нет данных', style: TextStyle(fontSize: 12, color: c.inkMuted)),
          ],
        ),
      );
    }

    final ({DateTime date, num value}) first = data.first;
    final ({DateTime date, num value}) last = data.last;
    final num delta = last.value - first.value;
    final int deltaPct = first.value > 0 ? ((delta / first.value) * 100).round() : 0;
    final int? idx = (_activeIdx != null && _activeIdx! < data.length) ? _activeIdx : null;
    final num shown = idx != null ? data[idx].value : last.value;
    final bool up = delta >= 0;
    final String deltaLabel = widget.formatValue != null
        ? '${up ? '+' : '−'}${_fmt(delta.abs())}'
        : '${up ? '+' : ''}${_fmt(delta)} ${widget.suffix}';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: <Widget>[
              Expanded(
                child: Text(widget.title,
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.ink)),
              ),
              Text(_fmt(shown), style: AppFonts.display(size: 22, color: c.ink)),
              if (widget.formatValue == null) ...<Widget>[
                const SizedBox(width: 4),
                Text(widget.suffix, style: TextStyle(fontSize: 11, color: c.inkMuted)),
              ],
            ],
          ),
          const SizedBox(height: 4),
          Text('$deltaLabel (${deltaPct >= 0 ? '+' : ''}$deltaPct%) с первой сессии',
              style: AppFonts.mono(size: 11, color: up ? c.accent : c.danger, weight: FontWeight.w600)),
          const SizedBox(height: 12),
          SizedBox(
            height: 140,
            child: _InteractiveLine(
              values: <num>[for (final ({DateTime date, num value}) p in data) p.value],
              color: widget.color,
              activeIdx: idx,
              onActive: (int? i) => setState(() => _activeIdx = i),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 16,
            child: Center(
              child: Text(
                idx != null
                    ? '${_fullDate(data[idx].date)} · ${_fmt(data[idx].value)}${widget.formatValue == null ? ' ${widget.suffix}' : ''}'
                    : 'Тяни по графику',
                style: AppFonts.mono(size: 11, color: c.inkMuted, weight: FontWeight.w500),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Чистый CustomPaint-график с заливкой и курсором по нажатию/протяжке.
class _InteractiveLine extends StatelessWidget {
  const _InteractiveLine(
      {required this.values, required this.color, required this.activeIdx, required this.onActive});
  final List<num> values;
  final Color color;
  final int? activeIdx;
  final ValueChanged<int?> onActive;

  void _resolve(double dx, double width) {
    if (values.length < 2) {
      onActive(values.isEmpty ? null : 0);
      return;
    }
    const double padX = 8;
    final double stepX = (width - padX * 2) / (values.length - 1);
    int best = 0;
    double bestD = double.infinity;
    for (int i = 0; i < values.length; i++) {
      final double x = padX + i * stepX;
      final double d = (x - dx).abs();
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    onActive(best);
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return LayoutBuilder(
      builder: (BuildContext ctx, BoxConstraints cons) {
        final double w = cons.maxWidth;
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: (TapDownDetails d) => _resolve(d.localPosition.dx, w),
          onHorizontalDragStart: (DragStartDetails d) => _resolve(d.localPosition.dx, w),
          onHorizontalDragUpdate: (DragUpdateDetails d) => _resolve(d.localPosition.dx, w),
          onHorizontalDragEnd: (_) => onActive(null),
          onTapUp: (_) => onActive(null),
          child: CustomPaint(
            size: Size(w, cons.maxHeight),
            painter: _LinePainter(
              values: <double>[for (final num v in values) v.toDouble()],
              color: color,
              cursor: c.inkMutedXl,
              bg: c.card,
              activeIdx: activeIdx,
            ),
          ),
        );
      },
    );
  }
}

class _LinePainter extends CustomPainter {
  _LinePainter(
      {required this.values,
      required this.color,
      required this.cursor,
      required this.bg,
      required this.activeIdx});
  final List<double> values;
  final Color color;
  final Color cursor;
  final Color bg;
  final int? activeIdx;

  @override
  void paint(Canvas canvas, Size size) {
    const double padX = 8;
    const double padY = 12;
    final double maxV = values.reduce(math.max);
    final double minV = values.reduce(math.min);
    final double range = maxV - minV;
    final double stepX = values.length > 1 ? (size.width - padX * 2) / (values.length - 1) : 0;
    final List<Offset> pts = <Offset>[
      for (int i = 0; i < values.length; i++)
        Offset(
          padX + i * stepX,
          range > 0
              ? size.height - padY - ((values[i] - minV) / range) * (size.height - padY * 2)
              : size.height / 2,
        ),
    ];

    final Path line = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (final Offset p in pts.skip(1)) {
      line.lineTo(p.dx, p.dy);
    }
    final Path area = Path.from(line)
      ..lineTo(pts.last.dx, size.height - padY)
      ..lineTo(pts.first.dx, size.height - padY)
      ..close();

    canvas.drawPath(area, Paint()..color = color.withValues(alpha: 0.12));
    canvas.drawPath(
        line,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..strokeJoin = StrokeJoin.round
          ..strokeCap = StrokeCap.round);
    final Paint dot = Paint()..color = color;
    for (final Offset p in pts) {
      canvas.drawCircle(p, 3, dot);
    }

    final int? ai = activeIdx;
    if (ai != null && ai < pts.length) {
      final Offset p = pts[ai];
      canvas.drawLine(Offset(p.dx, 0), Offset(p.dx, size.height),
          Paint()..color = cursor..strokeWidth = 1);
      canvas.drawCircle(p, 6, dot);
      canvas.drawCircle(p, 6, Paint()..color = bg..style = PaintingStyle.stroke..strokeWidth = 2);
    }
  }

  @override
  bool shouldRepaint(_LinePainter old) => old.activeIdx != activeIdx || old.values != values;
}

class _HistoryTable extends StatelessWidget {
  const _HistoryTable({required this.points, required this.isTimeBased});
  final List<ExerciseHistoryPoint> points;
  final bool isTimeBased;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final List<ExerciseHistoryPoint> sorted = points.reversed.toList(); // новые сверху
    return Container(
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: <Widget>[
          for (int i = 0; i < sorted.length; i++) ...<Widget>[
            if (i > 0) Divider(height: 1, thickness: 1, color: c.line),
            _historyRow(c, sorted[i]),
          ],
        ],
      ),
    );
  }

  Widget _historyRow(AppColors c, ExerciseHistoryPoint p) {
    final String right = isTimeBased
        ? <String>[
            if (p.maxTimeSec != null) 'PR ${_seconds(p.maxTimeSec!)}',
            '${_seconds(p.totalTimeSec)} всего',
          ].join('   ')
        : <String>[
            if (p.maxWeightKg != null)
              '${p.topReps != null ? '${p.topReps} × ' : ''}${p.maxWeightKg} кг',
            '${p.tonnage} кг тоннаж',
          ].join('   ');
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: <Widget>[
          Text(_fullDate(p.date), style: TextStyle(fontSize: 13, color: c.inkMuted)),
          const Spacer(),
          Flexible(
            child: Text('${p.totalSets} подх.   $right',
                textAlign: TextAlign.right,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }
}

// ─── Вкладка «Замеры» ──────────────────────────────────────────────────────────

class _MeasurementsTab extends ConsumerWidget {
  const _MeasurementsTab({required this.linked});
  final bool linked;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<List<Measurement>> ms = ref.watch(clientMeasurementsProvider);
    return ms.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (Object e, _) => _retry(
          context, () => ref.invalidate(clientMeasurementsProvider), 'Не удалось загрузить замеры.'),
      data: (List<Measurement> list) {
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          children: <Widget>[
            if (linked)
              _DashedButton(
                icon: Icons.add,
                label: 'Новый замер',
                onTap: () => _openForm(context, ref, null),
              )
            else
              Text('Подключите тренера, чтобы вести замеры.',
                  style: TextStyle(color: c.inkMuted, fontSize: 14)),
            if (list.isEmpty && linked) ...<Widget>[
              const SizedBox(height: 24),
              _emptyState(context, Icons.straighten, 'Замеров пока нет. Добавьте первый.'),
            ],
            if (list.isNotEmpty) ...<Widget>[
              const SizedBox(height: 16),
              _MeasurementsAnalytics(items: list),
              const SizedBox(height: 16),
              for (final Measurement m in list.reversed) ...<Widget>[
                _MeasurementCard(m: m, onEdit: () => _openForm(context, ref, m)),
                const SizedBox(height: 12),
              ],
            ],
          ],
        );
      },
    );
  }

  Future<void> _openForm(BuildContext context, WidgetRef ref, Measurement? m) async {
    final bool? saved = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: context.colors.bg,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _MeasureForm(measurement: m),
    );
    if (saved == true) ref.invalidate(clientMeasurementsProvider);
  }
}

class _MeasurementsAnalytics extends ConsumerStatefulWidget {
  const _MeasurementsAnalytics({required this.items});
  final List<Measurement> items;
  @override
  ConsumerState<_MeasurementsAnalytics> createState() => _MeasurementsAnalyticsState();
}

class _MeasurementsAnalyticsState extends ConsumerState<_MeasurementsAnalytics> {
  String _metric = 'weightKg';

  /// Точки метрики по возрастанию даты (только непустые значения).
  List<({DateTime? date, num v})> _points(String key) {
    final List<Measurement> asc = widget.items.toList()
      ..sort((Measurement a, Measurement b) =>
          (a.date ?? DateTime(0)).compareTo(b.date ?? DateTime(0)));
    return <({DateTime? date, num v})>[
      for (final Measurement m in asc)
        if (m.value(key) case final num v) (date: m.date, v: v),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    // Метрика доступна, только если у неё ≥2 непустых значения.
    final List<MetricDef> available =
        kMetrics.where((MetricDef m) => _points(m.key).length >= 2).toList();
    final MetricDef? active = available.isEmpty
        ? null
        : available.firstWhere((MetricDef m) => m.key == _metric, orElse: () => available.first);
    final List<({DateTime? date, num v})> pts = active == null ? <({DateTime? date, num v})>[] : _points(active.key);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _SectionLabel('Аналитика'),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
          child: available.isEmpty
              ? Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Center(
                    child: Text(
                      'Недостаточно данных для графика — нужно минимум 2 замера с одной метрикой.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: c.inkMuted),
                    ),
                  ),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: <Widget>[
                        for (final MetricDef m in available)
                          _Chip(
                            label: m.label,
                            active: active?.key == m.key,
                            onTap: () => setState(() => _metric = m.key),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    _MetricChart(points: pts, unit: active?.unit ?? '', color: c.accent),
                  ],
                ),
        ),
        const SizedBox(height: 12),
        const _TonnageChart(),
      ],
    );
  }
}

/// Мини-карта тоннажа по завершённым тренировкам клиента (≥2 точек).
class _TonnageChart extends ConsumerWidget {
  const _TonnageChart();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final List<Workout> all = ref.watch(clientWorkoutsProvider).valueOrNull ?? <Workout>[];
    final List<({DateTime? date, num v})> pts = <({DateTime? date, num v})>[];
    final List<({DateTime ms, Workout w})> completed = <({DateTime ms, Workout w})>[
      for (final Workout w in all)
        if (w.status == WorkoutStatus.completed)
          (ms: w.completedAt ?? w.startedAt ?? DateTime.fromMillisecondsSinceEpoch(0), w: w),
    ]..sort((a, b) => a.ms.compareTo(b.ms));
    for (final ({DateTime ms, Workout w}) e in completed) {
      final ClientStats s = aggregateClientStats(<Workout>[e.w]);
      if (s.tonnageKg > 0) pts.add((date: e.ms, v: s.tonnageKg));
    }
    if (pts.length < 2) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _SectionLabel('Тоннаж по тренировкам'),
          _MetricChart(points: pts, unit: 'кг', color: c.accent),
        ],
      ),
    );
  }
}

/// Простой график динамики метрики замеров/тоннажа (без курсора).
class _MetricChart extends StatelessWidget {
  const _MetricChart({required this.points, required this.unit, required this.color});
  final List<({DateTime? date, num v})> points;
  final String unit;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    if (points.length < 2) {
      return SizedBox(
        height: 80,
        child: Center(
          child: Text('Недостаточно данных для графика',
              style: TextStyle(fontSize: 12, color: c.inkMuted)),
        ),
      );
    }
    final double minV = points.map((e) => e.v).reduce((a, b) => a < b ? a : b).toDouble();
    final double maxV = points.map((e) => e.v).reduce((a, b) => a > b ? a : b).toDouble();
    String fmt(num n) => (n % 1 == 0 ? n.toInt() : (n * 10).round() / 10).toString().replaceAll('.', ',');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        SizedBox(
          height: 130,
          child: CustomPaint(
            painter: _LinePainter(
              values: <double>[for (final ({DateTime? date, num v}) p in points) p.v.toDouble()],
              color: color,
              cursor: c.inkMutedXl,
              bg: c.card,
              activeIdx: null,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: <Widget>[
            Text(_shortDate(points.first.date),
                style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w500)),
            Text('мин ${fmt(minV)} · макс ${fmt(maxV)} $unit',
                style: AppFonts.mono(size: 10, color: c.inkMuted, weight: FontWeight.w500)),
            Text(_shortDate(points.last.date),
                style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w500)),
          ],
        ),
      ],
    );
  }
}

class _MeasurementCard extends StatelessWidget {
  const _MeasurementCard({required this.m, required this.onEdit});
  final Measurement m;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final List<MetricDef> present =
        kMetrics.where((MetricDef d) => m.value(d.key) != null).toList();
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 14),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: <Widget>[
                    Flexible(
                      child: Text(_fullDate(m.date),
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
                    ),
                    const SizedBox(width: 8),
                    Text(m.createdByClient ? 'Вы' : 'Тренер',
                        style: AppFonts.mono(size: 9, color: c.inkMutedXl, weight: FontWeight.w600)),
                  ],
                ),
              ),
              GestureDetector(
                onTap: onEdit,
                behavior: HitTestBehavior.opaque,
                child: Padding(
                  padding: const EdgeInsets.all(6),
                  child: Icon(Icons.edit_outlined, size: 17, color: c.inkMuted),
                ),
              ),
            ],
          ),
          if (present.isNotEmpty) ...<Widget>[
            const SizedBox(height: 8),
            GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 8,
              childAspectRatio: 2.4,
              children: <Widget>[
                for (final MetricDef d in present)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: <Widget>[
                      Text(d.label.toUpperCase(),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppFonts.mono(size: 9, color: c.inkMutedXl, weight: FontWeight.w600)),
                      const SizedBox(height: 2),
                      Text.rich(TextSpan(children: <InlineSpan>[
                        TextSpan(
                            text: '${m.value(d.key)}',
                            style: AppFonts.mono(size: 15, color: c.ink, weight: FontWeight.w700)),
                        TextSpan(
                            text: ' ${d.unit}',
                            style: AppFonts.mono(size: 10, color: c.inkMuted, weight: FontWeight.w500)),
                      ])),
                    ],
                  ),
              ],
            ),
          ],
          if (m.note?.isNotEmpty == true) ...<Widget>[
            const SizedBox(height: 8),
            Text(m.note!, style: TextStyle(fontSize: 13, color: c.inkMuted)),
          ],
        ],
      ),
    );
  }
}

// ─── Форма замера (создание/правка) ───────────────────────────────────────────

const List<MetricDef> _bodyComposition = <MetricDef>[
  MetricDef('weightKg', 'Вес', 'кг'),
  MetricDef('skeletalMuscleKg', 'Скел. мышцы', 'кг'),
  MetricDef('bodyFatPct', '% жира', '%'),
];
const List<MetricDef> _girths = <MetricDef>[
  MetricDef('bicepsCm', 'Бицепс', 'см'),
  MetricDef('chestCm', 'Грудь', 'см'),
  MetricDef('underbustCm', 'Под грудью', 'см'),
  MetricDef('waistCm', 'Талия', 'см'),
  MetricDef('bellyCm', 'Живот', 'см'),
  MetricDef('glutesCm', 'Ягодицы', 'см'),
  MetricDef('thighCm', 'Бедро', 'см'),
  MetricDef('calfCm', 'Голень', 'см'),
];

class _MeasureForm extends ConsumerStatefulWidget {
  const _MeasureForm({this.measurement});
  final Measurement? measurement;
  @override
  ConsumerState<_MeasureForm> createState() => _MeasureFormState();
}

class _MeasureFormState extends ConsumerState<_MeasureForm> {
  late final Map<String, TextEditingController> _ctrls = <String, TextEditingController>{
    for (final MetricDef m in kMetrics)
      m.key: TextEditingController(
          text: widget.measurement?.value(m.key)?.toString() ?? ''),
  };
  late final TextEditingController _note =
      TextEditingController(text: widget.measurement?.note ?? '');
  late DateTime _date = widget.measurement?.date ?? DateTime.now();
  bool _busy = false;
  bool _deleting = false;

  bool get _isEdit => widget.measurement != null;

  @override
  void dispose() {
    for (final TextEditingController c in _ctrls.values) {
      c.dispose();
    }
    _note.dispose();
    super.dispose();
  }

  num? _n(String s) => num.tryParse(s.trim().replaceAll(',', '.'));

  Future<void> _save() async {
    if (_busy) return;
    // Пустое поле = null (для PATCH очищает значение на сервере).
    final Map<String, dynamic> body = <String, dynamic>{'date': _iso(_date)};
    for (final MetricDef m in kMetrics) {
      final String raw = _ctrls[m.key]!.text.trim();
      if (_isEdit) {
        body[m.key] = raw.isEmpty ? null : _n(raw);
      } else if (raw.isNotEmpty) {
        body[m.key] = _n(raw);
      }
    }
    final String note = _note.text.trim();
    if (_isEdit) {
      body['note'] = note.isEmpty ? null : note;
    } else if (note.isNotEmpty) {
      body['note'] = note;
    }
    if (!_isEdit && body.length == 1) return; // только дата — нечего сохранять
    setState(() => _busy = true);
    final NavigatorState nav = Navigator.of(context);
    final ScaffoldMessengerState msg = ScaffoldMessenger.of(context);
    try {
      final ClientMeasurementsApi api = ref.read(clientMeasurementsApiProvider);
      if (_isEdit) {
        await api.update(widget.measurement!.id, body);
      } else {
        await api.create(body);
      }
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      msg.showSnackBar(const SnackBar(content: Text('Не удалось сохранить замер')));
    }
  }

  Future<void> _delete() async {
    if (_deleting) return;
    setState(() => _deleting = true);
    final NavigatorState nav = Navigator.of(context);
    try {
      await ref.read(clientMeasurementsApiProvider).delete(widget.measurement!.id);
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 4, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Text(_isEdit ? 'Редактировать замер' : 'Новый замер',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: c.ink)),
              const Spacer(),
              _dateChip(c),
            ],
          ),
          const SizedBox(height: 14),
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  _SectionLabel('Состав тела'),
                  _fieldsGrid(_bodyComposition),
                  const SizedBox(height: 14),
                  _SectionLabel('Обхваты'),
                  _fieldsGrid(_girths),
                  const SizedBox(height: 14),
                  _SectionLabel('Заметка'),
                  TextField(
                    controller: _note,
                    maxLines: 3,
                    decoration: InputDecoration(
                      hintText: 'Например: утро натощак',
                      filled: true,
                      fillColor: c.card,
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: <Widget>[
              if (_isEdit) ...<Widget>[
                _HoldToDelete(busy: _deleting, onDelete: _delete),
                const SizedBox(width: 12),
              ],
              Expanded(
                child: FilledButton(
                  onPressed: _busy ? null : _save,
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  child: Text(_busy ? 'Сохранение…' : 'Сохранить'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _dateChip(AppColors c) => GestureDetector(
        onTap: () async {
          final DateTime now = DateTime.now();
          final DateTime? d = await showDatePicker(
              context: context, initialDate: _date, firstDate: DateTime(now.year - 5), lastDate: now);
          if (d != null) setState(() => _date = d);
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(10)),
          child: Row(mainAxisSize: MainAxisSize.min, children: <Widget>[
            Icon(Icons.event, size: 15, color: c.inkMuted),
            const SizedBox(width: 6),
            Text(_shortDate(_date), style: TextStyle(fontSize: 13, color: c.ink)),
          ]),
        ),
      );

  Widget _fieldsGrid(List<MetricDef> fields) => GridView.count(
        crossAxisCount: 3,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        childAspectRatio: 1.5,
        children: <Widget>[
          for (final MetricDef m in fields)
            _NumField(label: '${m.label}, ${m.unit}', ctrl: _ctrls[m.key]!),
        ],
      );
}

class _NumField extends StatelessWidget {
  const _NumField({required this.label, required this.ctrl});
  final String label;
  final TextEditingController ctrl;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.center,
      children: <Widget>[
        Text(label.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppFonts.mono(size: 9, color: c.inkMutedXl, weight: FontWeight.w600)),
        const SizedBox(height: 4),
        SizedBox(
          height: 38,
          child: SelectAllTextField(
            controller: ctrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
            textAlign: TextAlign.center,
            style: AppFonts.mono(size: 15, color: c.ink, weight: FontWeight.w600),
            decoration: InputDecoration(
              isDense: true,
              filled: true,
              fillColor: c.chip,
              hintText: '—',
              contentPadding: const EdgeInsets.symmetric(vertical: 6),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.line)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.line)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.accent)),
            ),
          ),
        ),
      ],
    );
  }
}

// ─── Вкладка «Фото» ────────────────────────────────────────────────────────────

class _PhotosTab extends ConsumerStatefulWidget {
  const _PhotosTab({required this.linked});
  final bool linked;
  @override
  ConsumerState<_PhotosTab> createState() => _PhotosTabState();
}

class _PhotosTabState extends ConsumerState<_PhotosTab> {
  String _angle = 'front';
  DateTime _date = DateTime.now();
  bool _uploading = false;
  String? _error;

  Future<void> _pick() async {
    if (_uploading) return;
    final XFile? p =
        await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1600, imageQuality: 85);
    if (p == null) return;
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      await ref.read(clientPhotosApiProvider).upload(
          date: _iso(_date), angle: _angle, filePath: p.path, fileName: p.name);
      if (!mounted) return;
      ref.invalidate(clientPhotosProvider);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Не удалось загрузить фото.');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _pickMulti() async {
    if (_uploading) return;
    final List<XFile> picked =
        await ImagePicker().pickMultiImage(limit: 3, maxWidth: 1600, imageQuality: 85);
    if (picked.isEmpty) return;
    final List<XFile> files = picked.take(3).toList();
    const List<String> angles = <String>['front', 'side', 'back'];
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      for (int i = 0; i < files.length; i++) {
        final XFile x = files[i];
        await ref.read(clientPhotosApiProvider).upload(
            date: _iso(_date), angle: angles[i], filePath: x.path, fileName: x.name);
      }
      if (!mounted) return;
      ref.invalidate(clientPhotosProvider);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Фото добавлены')));
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Не удалось загрузить фото.');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _delete(ProgressPhoto p) async {
    try {
      await ref.read(clientPhotosApiProvider).delete(p.id);
      ref.invalidate(clientPhotosProvider);
    } catch (_) {}
  }

  Future<void> _openViewer(ProgressPhoto p, String? token) async {
    final bool? deleted = await PhotoViewerScreen.show(
      context,
      url: ref.read(clientPhotosApiProvider).photoUrl(p.fileId),
      token: token,
      title: kAngleLabels[p.angle] ?? p.angle,
      subtitle: '${_fullDate(p.date)} · ${p.createdByClient ? 'Вы' : 'Тренер'}',
      onDelete: () => ref.read(clientPhotosApiProvider).delete(p.id),
    );
    if (deleted == true && mounted) ref.invalidate(clientPhotosProvider);
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    if (!widget.linked) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text('Подключитесь к тренеру, чтобы вести фото прогресса.',
              textAlign: TextAlign.center, style: TextStyle(color: c.inkMuted, fontSize: 14)),
        ),
      );
    }

    final AsyncValue<List<ProgressPhoto>> ps = ref.watch(clientPhotosProvider);
    final String? token = ref.watch(sessionProvider).token;
    final ClientPhotosApi api = ref.read(clientPhotosApiProvider);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      children: <Widget>[
        // Карточка загрузки: дата + силуэтный гид ракурса + кнопка выбора фото.
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              GestureDetector(
                onTap: () async {
                  final DateTime now = DateTime.now();
                  final DateTime? d = await showDatePicker(
                      context: context, initialDate: _date, firstDate: DateTime(now.year - 5), lastDate: now);
                  if (d != null) setState(() => _date = d);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(color: c.cardElevated, borderRadius: BorderRadius.circular(12)),
                  child: Row(children: <Widget>[
                    Icon(Icons.event, size: 16, color: c.inkMuted),
                    const SizedBox(width: 8),
                    Text(_fullDate(_date), style: TextStyle(fontSize: 14, color: c.ink)),
                  ]),
                ),
              ),
              const SizedBox(height: 12),
              _BodyPoseGuide(value: _angle, onSelect: (String a) => setState(() => _angle = a)),
              const SizedBox(height: 12),
              _DashedButton(
                icon: Icons.add_photo_alternate_outlined,
                label: _uploading
                    ? 'Загрузка · ${kAngleLabels[_angle]}…'
                    : 'Выбрать фото · ${kAngleLabels[_angle]}',
                onTap: _uploading ? null : _pick,
              ),
              const SizedBox(height: 8),
              _DashedButton(
                icon: Icons.burst_mode_outlined,
                label: 'Загрузить до 3 фото · спереди · сбоку · сзади',
                onTap: _uploading ? null : _pickMulti,
              ),
            ],
          ),
        ),
        if (_error != null) ...<Widget>[
          const SizedBox(height: 12),
          Text(_error!, style: TextStyle(fontSize: 13, color: c.inkMuted)),
        ],
        const SizedBox(height: 16),
        ...ps.when(
          loading: () => <Widget>[const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))],
          error: (Object e, _) => <Widget>[
            Text('Не удалось загрузить фото.', style: TextStyle(fontSize: 14, color: c.inkMuted)),
          ],
          data: (List<ProgressPhoto> list) {
            if (list.isEmpty) {
              return <Widget>[_emptyState(context, Icons.photo_library_outlined, 'Фотографий пока нет. Добавьте первую.')];
            }
            // Группировка по датам, новые сверху.
            final Map<String, List<ProgressPhoto>> groups = <String, List<ProgressPhoto>>{};
            for (final ProgressPhoto p in list) {
              groups.putIfAbsent(p.date == null ? '' : _iso(p.date!), () => <ProgressPhoto>[]).add(p);
            }
            final List<String> keys = groups.keys.toList()..sort((a, b) => b.compareTo(a));
            return <Widget>[
              for (final String k in keys) ...<Widget>[
                _SectionLabel(_fullDate(groups[k]!.first.date)),
                GridView.count(
                  crossAxisCount: 3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  children: <Widget>[
                    for (final ProgressPhoto p in groups[k]!)
                      _PhotoTile(
                        url: api.photoUrl(p.fileId),
                        token: token,
                        angle: kAngleLabels[p.angle] ?? p.angle,
                        author: p.createdByClient ? 'Вы' : 'Тренер',
                        onDelete: () => _delete(p),
                        onTap: () => _openViewer(p, token),
                      ),
                  ],
                ),
                const SizedBox(height: 16),
              ],
            ];
          },
        ),
      ],
    );
  }
}

class _PhotoTile extends StatelessWidget {
  const _PhotoTile(
      {required this.url,
      required this.token,
      required this.angle,
      required this.author,
      required this.onDelete,
      required this.onTap});
  final String url;
  final String? token;
  final String angle;
  final String author; // кто добавил: «Вы» / «Тренер»
  final VoidCallback onDelete;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: <Widget>[
        GestureDetector(
          onTap: onTap,
          behavior: HitTestBehavior.opaque,
          child: AuthedImage(url: url, token: token, radius: 12),
        ),
        Positioned(
          left: 6,
          top: 6,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(4)),
                child: Text(angle,
                    style: AppFonts.mono(size: 9, color: Colors.white, weight: FontWeight.w700)),
              ),
              const SizedBox(height: 3),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(4)),
                child: Text(author,
                    style: AppFonts.mono(size: 9, color: Colors.white.withValues(alpha: 0.85), weight: FontWeight.w500)),
              ),
            ],
          ),
        ),
        Positioned(
          right: 6,
          top: 6,
          child: _HoldToDelete(onDelete: onDelete, compact: true),
        ),
      ],
    );
  }
}

/// Силуэтный гид «как встать»: три позы (спереди/сбоку/сзади), активная подсвечена.
class _BodyPoseGuide extends StatelessWidget {
  const _BodyPoseGuide({required this.value, required this.onSelect});
  final String value;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text('В облегающей одежде или белье, телефон на уровне пояса, ровный фон, вся фигура в кадре.',
            style: TextStyle(fontSize: 12, height: 1.3, color: c.inkMuted)),
        const SizedBox(height: 8),
        Row(
          children: <Widget>[
            for (final MapEntry<String, String> e in kAngleLabels.entries) ...<Widget>[
              Expanded(
                child: GestureDetector(
                  onTap: () => onSelect(e.key),
                  behavior: HitTestBehavior.opaque,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: value == e.key ? c.accent.withValues(alpha: 0.10) : c.cardElevated,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: value == e.key ? c.accent : c.line),
                    ),
                    child: Column(
                      children: <Widget>[
                        SizedBox(
                          height: 56,
                          child: CustomPaint(
                            size: const Size(40, 56),
                            painter: _SilhouettePainter(
                              pose: e.key,
                              color: value == e.key ? c.accent : c.inkMutedXl,
                            ),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(e.value,
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: value == e.key ? c.ink : c.inkMuted)),
                      ],
                    ),
                  ),
                ),
              ),
              if (e.key != kAngleLabels.keys.last) const SizedBox(width: 8),
            ],
          ],
        ),
      ],
    );
  }
}

/// Силуэт-«тушка» для подсказки ракурса (фронт/спина — симметрично, сбоку — профиль).
class _SilhouettePainter extends CustomPainter {
  _SilhouettePainter({required this.pose, required this.color});
  final String pose;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final double sx = size.width / 80;
    final double sy = size.height / 170;
    final Paint paint = Paint()..color = color..style = PaintingStyle.fill;
    Rect r(double x, double y, double w, double h) =>
        Rect.fromLTWH(x * sx, y * sy, w * sx, h * sy);
    void rr(double x, double y, double w, double h, double rad) => canvas.drawRRect(
        RRect.fromRectAndRadius(r(x, y, w, h), Radius.circular(rad * sx)), paint);

    if (pose == 'side') {
      canvas.drawCircle(Offset(33 * sx, 16 * sy), 11 * sx, paint);
      rr(30, 30, 17, 56, 8.5);
      rr(32, 84, 9, 66, 4.5);
      rr(39, 84, 9, 66, 4.5);
    } else {
      canvas.drawCircle(Offset(40 * sx, 15 * sy), 11 * sx, paint);
      rr(25, 32, 30, 52, 9); // торс
      rr(30, 83, 9, 66, 4.5);
      rr(41, 83, 9, 66, 4.5);
    }
  }

  @override
  bool shouldRepaint(_SilhouettePainter old) => old.pose != pose || old.color != color;
}

// ─── Hold-to-delete (удержание без диалога подтверждения) ──────────────────────

class _HoldToDelete extends StatefulWidget {
  const _HoldToDelete({required this.onDelete, this.busy = false, this.compact = false});
  final VoidCallback onDelete;
  final bool busy;
  final bool compact;
  @override
  State<_HoldToDelete> createState() => _HoldToDeleteState();
}

class _HoldToDeleteState extends State<_HoldToDelete> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900))
        ..addStatusListener((AnimationStatus s) {
          if (s == AnimationStatus.completed) {
            widget.onDelete();
            _ctrl.reset();
          }
        });

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    if (widget.compact) {
      return GestureDetector(
        onLongPressStart: (_) => _ctrl.forward(),
        onLongPressEnd: (_) => _ctrl.reverse(),
        child: AnimatedBuilder(
          animation: _ctrl,
          builder: (BuildContext ctx, _) => Container(
            width: 26,
            height: 26,
            decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.55), shape: BoxShape.circle),
            alignment: Alignment.center,
            child: _ctrl.value > 0
                ? SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(value: _ctrl.value, strokeWidth: 2, color: c.danger),
                  )
                : const Icon(Icons.delete_outline, size: 16, color: Colors.white),
          ),
        ),
      );
    }
    return GestureDetector(
      onLongPressStart: widget.busy ? null : (_) => _ctrl.forward(),
      onLongPressEnd: widget.busy ? null : (_) => _ctrl.reverse(),
      child: AnimatedBuilder(
        animation: _ctrl,
        builder: (BuildContext ctx, _) => Container(
          height: 48,
          width: 48,
          decoration: BoxDecoration(
            color: c.card,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: c.danger.withValues(alpha: 0.5)),
          ),
          alignment: Alignment.center,
          child: _ctrl.value > 0
              ? SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(value: _ctrl.value, strokeWidth: 2.5, color: c.danger),
                )
              : Icon(Icons.delete_outline, size: 20, color: c.danger),
        ),
      ),
    );
  }
}

// ─── Общие виджеты ─────────────────────────────────────────────────────────────

class _DashedButton extends StatelessWidget {
  const _DashedButton({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 13),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: c.line),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Icon(icon, size: 18, color: c.ink),
            const SizedBox(width: 8),
            Flexible(
              child: Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.ink)),
            ),
          ],
        ),
      ),
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
        behavior: HitTestBehavior.opaque,
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
              color: active ? c.card : Colors.transparent, borderRadius: BorderRadius.circular(11)),
          child: Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: active ? c.ink : c.inkMuted)),
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
    return GestureDetector(
      onTap: onTap,
      child: Container(
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(color: active ? c.accent : c.chip, borderRadius: BorderRadius.circular(20)),
        child: Text(label,
            style: AppFonts.mono(size: 12, color: active ? c.accentOn : c.inkMuted, weight: FontWeight.w600)),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 8),
        child: Text(text.toUpperCase(),
            style: AppFonts.mono(size: 11, color: context.colors.inkMutedXl, weight: FontWeight.w600, letterSpacing: 0.6)),
      );
}
