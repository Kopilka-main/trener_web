import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_assign.dart';
import '../api/trainer_client_stats.dart';
import '../widgets/no_connection_view.dart';

// ─── Форматирование (зеркало web ClientStatsPage) ───

const List<String> _ruMonths = <String>[
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

String _fmtNum(num n) => n % 1 == 0 ? n.toInt().toString() : n.toString();

String _fmtTonnage(int kg) =>
    kg >= 1000 ? '${(kg / 1000).toStringAsFixed(1).replaceAll('.', ',')} т' : '$kg кг';

/// Компактно (строка обзора): «1,5 ч» / «3 мин» / «45 с».
String _fmtTimeShort(num sec) {
  if (sec >= 3600) return '${(sec / 3600).toStringAsFixed(1).replaceAll('.', ',')} ч';
  if (sec >= 60) return '${(sec / 60).round()} мин';
  return '${_fmtNum(sec)} с';
}

/// Подробно (графики/история): «1ч 05м» / «2:05» / «45с».
String _fmtSeconds(num sec) {
  final int s = sec.round();
  if (s >= 3600) {
    final int h = s ~/ 3600;
    final int m = (s % 3600) ~/ 60;
    return '$hч ${m.toString().padLeft(2, '0')}м';
  }
  if (s >= 60) return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
  return '$sс';
}

String _fmtRelative(DateTime? d) {
  if (d == null) return '';
  final int days = DateTime.now().difference(d).inDays;
  if (days <= 0) return 'сегодня';
  if (days == 1) return 'вчера';
  if (days < 7) return '$days дн назад';
  if (days < 30) return '${days ~/ 7} нед назад';
  if (days < 365) return '${days ~/ 30} мес назад';
  return '${days ~/ 365} г назад';
}

String _fmtFullDate(DateTime? d) =>
    d == null ? '—' : '${d.day} ${_ruMonths[d.month - 1]} ${d.year}';

// ─── Вкладка «Упражнения»: список упражнений с обзором ───

/// Список упражнений из проведённых тренировок: PR/тоннаж/тренд, тап → деталь.
/// Зеркало веб ExercisesTab.
class ExerciseProgressTab extends ConsumerWidget {
  const ExerciseProgressTab({super.key, required this.clientId});
  final String clientId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<List<ExerciseOverview>> items = ref.watch(clientExerciseOverviewProvider(clientId));
    return items.when(
      loading: () => Padding(
        padding: const EdgeInsets.all(24),
        child: Text('Загрузка…', style: TextStyle(color: c.inkMuted)),
      ),
      error: (Object e, _) => isOfflineError(e)
          ? NoConnectionView(onRetry: () => ref.invalidate(clientExerciseOverviewProvider(clientId)))
          : Padding(
              padding: const EdgeInsets.all(24),
              child: Text('Не удалось загрузить статистику.', style: TextStyle(color: c.inkMuted)),
            ),
      data: (List<ExerciseOverview> list) {
        if (list.isEmpty) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 40),
            child: Column(
              children: <Widget>[
                Icon(Icons.fitness_center, size: 36, color: c.inkMutedXl),
                const SizedBox(height: 12),
                Text('Клиент ещё не делал упражнений\nв проведённых тренировках.',
                    textAlign: TextAlign.center, style: TextStyle(color: c.inkMuted, height: 1.4)),
              ],
            ),
          );
        }
        return Column(
          children: list
              .map((ExerciseOverview ex) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _ExerciseRow(
                      ex: ex,
                      onOpen: () => Navigator.of(context).push<void>(MaterialPageRoute<void>(
                        builder: (_) => ExerciseDetailScreen(
                            clientId: clientId, exerciseId: ex.exerciseId, name: ex.name),
                      )),
                    ),
                  ))
              .toList(),
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
    final List<Widget> stats = <Widget>[];
    if (ex.isTimeBased) {
      if (ex.maxTimeSec != null) stats.add(_stat(c, 'PR', _fmtTimeShort(ex.maxTimeSec!)));
      if (ex.totalTimeSec > 0) stats.add(_stat(c, 'время', _fmtTimeShort(ex.totalTimeSec)));
    } else {
      if (ex.maxWeightKg != null) stats.add(_stat(c, 'PR', '${_fmtNum(ex.maxWeightKg!)} кг'));
      if (ex.tonnageKg > 0) stats.add(_stat(c, 'тоннаж', _fmtTonnage(ex.tonnageKg)));
    }
    if (ex.lastDate != null) {
      stats.add(Text('· ${_fmtRelative(ex.lastDate)}',
          style: AppFonts.mono(size: 12, color: c.inkMuted)));
    }

    return GestureDetector(
      onTap: onOpen,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
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
                  Wrap(spacing: 12, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: stats),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(ex.lastIsRecord ? Icons.arrow_upward : Icons.arrow_downward,
                size: 18, color: ex.lastIsRecord ? c.accent : c.inkMutedXl),
            Icon(Icons.chevron_right, size: 18, color: c.inkMutedXl),
          ],
        ),
      ),
    );
  }

  Widget _stat(AppColors c, String label, String value) => Text.rich(
        TextSpan(children: <InlineSpan>[
          TextSpan(text: '$label ', style: AppFonts.mono(size: 12, color: c.inkMuted)),
          TextSpan(text: value, style: AppFonts.mono(size: 12, color: c.ink, weight: FontWeight.w700)),
        ]),
      );
}

// ─── Деталь упражнения: графики + история ───

/// Прогресс по одному упражнению: тумблер «Только рекорды», графики
/// тоннаж/вес (или время) и список сессий. Зеркало веб ExerciseDetail.
class ExerciseDetailScreen extends ConsumerStatefulWidget {
  const ExerciseDetailScreen(
      {super.key, required this.clientId, required this.exerciseId, required this.name});
  final String clientId;
  final String exerciseId;
  final String name;

  @override
  ConsumerState<ExerciseDetailScreen> createState() => _ExerciseDetailScreenState();
}

class _ExerciseDetailScreenState extends ConsumerState<ExerciseDetailScreen> {
  bool _recordsOnly = true;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final AsyncValue<List<Map<String, dynamic>>> raw =
        ref.watch(clientWorkoutsRawProvider(widget.clientId));
    return Scaffold(
      // Заголовок раздела — «Прогресс»; само упражнение показано карточкой ниже.
      appBar: AppBar(title: const Text('Прогресс')),
      body: raw.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => isOfflineError(e)
            ? NoConnectionView(
                onRetry: () => ref.invalidate(clientWorkoutsRawProvider(widget.clientId)))
            : Center(child: Text('Не удалось загрузить', style: TextStyle(color: c.inkMuted))),
        data: (List<Map<String, dynamic>> all) {
          final ExerciseHistory? h = aggregateExerciseHistory(all, widget.exerciseId);
          if (h == null || h.points.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text('Клиент ещё не делал это упражнение\nв проведённых тренировках.',
                    textAlign: TextAlign.center, style: TextStyle(color: c.inkMuted, height: 1.4)),
              ),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: <Widget>[
              // Краткая информация об упражнении (из каталога).
              _ExerciseInfoCard(exerciseId: widget.exerciseId),
              // Тумблер «Только рекорды».
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
                child: Row(
                  children: <Widget>[
                    Expanded(
                        child: Text('Только рекорды',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink))),
                    Switch(value: _recordsOnly, onChanged: (bool v) => setState(() => _recordsOnly = v)),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              if (h.isTimeBased) ...<Widget>[
                ChartCard(
                  title: 'Максимальное время',
                  color: c.accent,
                  recordsOnly: _recordsOnly,
                  points: h.points.map((ExerciseHistoryPoint p) => (p.date, (p.maxTimeSec ?? 0).toDouble())).toList(),
                  format: _fmtSeconds,
                ),
                const SizedBox(height: 12),
                ChartCard(
                  title: 'Суммарное время',
                  color: c.danger,
                  recordsOnly: _recordsOnly,
                  points: h.points.map((ExerciseHistoryPoint p) => (p.date, p.totalTimeSec.toDouble())).toList(),
                  format: _fmtSeconds,
                ),
              ] else ...<Widget>[
                ChartCard(
                  title: 'Тоннаж',
                  color: c.accent,
                  recordsOnly: _recordsOnly,
                  points: h.points.map((ExerciseHistoryPoint p) => (p.date, p.tonnage.toDouble())).toList(),
                  format: (num v) => _fmtTonnage(v.round()),
                ),
                const SizedBox(height: 12),
                ChartCard(
                  title: 'Максимальный вес',
                  color: c.danger,
                  recordsOnly: _recordsOnly,
                  points: h.points.map((ExerciseHistoryPoint p) => (p.date, (p.maxWeightKg ?? 0).toDouble())).toList(),
                  format: (num v) => '${_fmtNum(v)} кг',
                ),
              ],
              const SizedBox(height: 16),
              _HistoryList(points: h.points, isTimeBased: h.isTimeBased),
            ],
          );
        },
      ),
    );
  }
}

/// Краткая инфо-карточка упражнения из каталога (медиа + группа + оборудование/
/// мышцы/техника). Если упражнения нет в каталоге — ничего не показываем.
class _ExerciseInfoCard extends ConsumerWidget {
  const _ExerciseInfoCard({required this.exerciseId});
  final String exerciseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final TExercise? ex = (ref.watch(trainerCatalogProvider).valueOrNull ?? const <TExercise>[])
        .where((TExercise e) => e.id == exerciseId)
        .firstOrNull;
    if (ex == null) return const SizedBox.shrink();
    final String base = ref.watch(baseUrlProvider);
    final String? img = catalogMediaUrl(base, ex.imageUrl ?? ex.thumbUrl);
    final String? vid = catalogMediaUrl(base, ex.videoUrl);
    final bool hasMedia = (img != null && img.isNotEmpty) || (vid != null && vid.isNotEmpty);
    final String sub = <String>[
      if (ex.category.isNotEmpty) ex.category,
      if (ex.subgroup?.isNotEmpty == true) ex.subgroup!,
    ].join(' · ');

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(ex.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: c.ink)),
          if (sub.isNotEmpty) ...<Widget>[
            const SizedBox(height: 2),
            Text(sub, style: TextStyle(fontSize: 12, color: c.inkMuted)),
          ],
          if (hasMedia) ...<Widget>[
            const SizedBox(height: 10),
            CatalogMediaView(imageUrl: img, videoUrl: vid, height: 180, showToggle: true),
          ],
          if (ex.equipment?.isNotEmpty == true) ...<Widget>[
            const SizedBox(height: 10),
            _InfoLine(label: 'Оборудование', value: ex.equipment!),
          ],
          if (ex.primaryMuscles?.isNotEmpty == true) ...<Widget>[
            const SizedBox(height: 8),
            _InfoLine(label: 'Мышцы', value: ex.primaryMuscles!),
          ],
          if (ex.description?.isNotEmpty == true) ...<Widget>[
            const SizedBox(height: 8),
            _InfoLine(label: 'Техника', value: ex.description!),
          ],
        ],
      ),
    );
  }
}

class _InfoLine extends StatelessWidget {
  const _InfoLine({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(label.toUpperCase(),
            style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w600)),
        const SizedBox(height: 2),
        Text(value, style: TextStyle(fontSize: 13, color: c.ink, height: 1.35)),
      ],
    );
  }
}

/// Карточка-график одной метрики: заголовок + значение + дельта + спарклайн с
/// реперными точками. Тап по графику выбирает ближайшую точку и показывает её
/// дату/значение.
/// Карточка-график одного показателя во времени: заголовок, текущее/выбранное
/// значение, спарклайн с тапом по точкам, тренд «% к первой». Переиспользуется
/// для динамики упражнений и замеров тела.
class ChartCard extends StatefulWidget {
  const ChartCard({
    super.key,
    required this.title,
    required this.color,
    required this.recordsOnly,
    required this.points,
    required this.format,
  });
  final String title;
  final Color color;
  final bool recordsOnly;
  final List<(DateTime?, double)> points;
  final String Function(num) format;

  @override
  State<ChartCard> createState() => _ChartCardState();
}

class _ChartCardState extends State<ChartCard> {
  int? _sel;

  @override
  void didUpdateWidget(ChartCard old) {
    super.didUpdateWidget(old);
    if (old.recordsOnly != widget.recordsOnly || old.points != widget.points) _sel = null;
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    // Точки с датой и значением > 0; в режиме «рекорды» — нарастающий максимум.
    final List<(DateTime?, double)> data = <(DateTime?, double)>[];
    double mx = double.negativeInfinity;
    for (final (DateTime?, double) p in widget.points) {
      if (p.$1 == null || p.$2 <= 0) continue;
      if (widget.recordsOnly) {
        if (p.$2 > mx) {
          mx = p.$2;
          data.add(p);
        }
      } else {
        data.add(p);
      }
    }
    final List<double> values = <double>[for (final (DateTime?, double) p in data) p.$2];
    final int? sel = (_sel != null && _sel! >= 0 && _sel! < values.length) ? _sel : null;

    final Widget header = Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: <Widget>[
          Expanded(
            child: Text(widget.title, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.ink)),
          ),
          if (values.isNotEmpty)
            Text(widget.format(sel != null ? values[sel] : values.last),
                style: AppFonts.mono(size: 14, color: c.ink, weight: FontWeight.w700)),
        ],
      ),
    );

    if (values.isEmpty) {
      return Container(
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            header,
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 6, 14, 14),
              child: Text('Нет данных', style: TextStyle(fontSize: 12, color: c.inkMuted)),
            ),
          ],
        ),
      );
    }

    final double delta = values.last - values.first;
    final int pct = values.first > 0 ? (delta / values.first * 100).round() : 0;
    // Подпись: выбранная точка (дата · значение) либо общий тренд.
    final Widget subline = sel != null
        ? Padding(
            padding: const EdgeInsets.fromLTRB(14, 2, 14, 0),
            child: Text('${_fmtFullDate(data[sel].$1)} · ${widget.format(values[sel])}',
                style: AppFonts.mono(size: 11, color: widget.color, weight: FontWeight.w600)),
          )
        : (pct != 0
            ? Padding(
                padding: const EdgeInsets.fromLTRB(14, 2, 14, 0),
                child: Text('${pct > 0 ? '+' : ''}$pct% к первой',
                    style: AppFonts.mono(size: 11, color: pct > 0 ? c.accent : c.inkMuted)),
              )
            : const SizedBox.shrink());

    return Container(
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          header,
          subline,
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
            child: LayoutBuilder(
              builder: (BuildContext ctx, BoxConstraints cons) {
                final double width = cons.maxWidth;
                return GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTapDown: (TapDownDetails d) {
                    if (values.length < 2) {
                      setState(() => _sel = 0);
                      return;
                    }
                    const double padX = 6;
                    final double stepX = (width - padX * 2) / (values.length - 1);
                    final int idx =
                        ((d.localPosition.dx - padX) / stepX).round().clamp(0, values.length - 1);
                    setState(() => _sel = idx);
                  },
                  child: SizedBox(
                    height: 90,
                    width: double.infinity,
                    child: CustomPaint(painter: _SparkPainter(values, widget.color, c.line, sel)),
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

class _SparkPainter extends CustomPainter {
  _SparkPainter(this.values, this.color, this.gridColor, this.selected);
  final List<double> values;
  final Color color;
  final Color gridColor;
  final int? selected;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty) return;
    final double maxV = values.reduce((double a, double b) => a > b ? a : b);
    final double minV = values.reduce((double a, double b) => a < b ? a : b);
    final double range = maxV - minV;
    const double padX = 6;
    const double padY = 8;
    final double w = size.width - padX * 2;
    final double h = size.height - padY * 2;
    final double stepX = values.length > 1 ? w / (values.length - 1) : 0;

    final List<Offset> pts = <Offset>[
      for (int i = 0; i < values.length; i++)
        Offset(
          padX + i * stepX,
          range > 0 ? padY + h - ((values[i] - minV) / range) * h : padY + h / 2,
        ),
    ];

    // Заливка под линией.
    final Path area = Path()..moveTo(pts.first.dx, size.height - padY);
    for (final Offset p in pts) {
      area.lineTo(p.dx, p.dy);
    }
    area.lineTo(pts.last.dx, size.height - padY);
    area.close();
    canvas.drawPath(area, Paint()..color = color.withValues(alpha: 0.12));

    // Линия.
    final Path line = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (final Offset p in pts.skip(1)) {
      line.lineTo(p.dx, p.dy);
    }
    canvas.drawPath(
      line,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    // Реперные точки на всех значениях.
    final Paint dot = Paint()..color = color;
    for (final Offset p in pts) {
      canvas.drawCircle(p, 2.5, dot);
    }

    // Выбранная точка: вертикальная направляющая + крупный кружок.
    if (selected != null && selected! >= 0 && selected! < pts.length) {
      final Offset sp = pts[selected!];
      canvas.drawLine(
        Offset(sp.dx, padY),
        Offset(sp.dx, size.height - padY),
        Paint()
          ..color = gridColor
          ..strokeWidth = 1,
      );
      canvas.drawCircle(sp, 5.5, Paint()..color = color);
    }
  }

  @override
  bool shouldRepaint(_SparkPainter old) =>
      old.values != values || old.color != color || old.selected != selected;
}

/// Список сессий (новые сверху) — зеркало веб HistoryTable.
class _HistoryList extends StatelessWidget {
  const _HistoryList({required this.points, required this.isTimeBased});
  final List<ExerciseHistoryPoint> points;
  final bool isTimeBased;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final List<ExerciseHistoryPoint> sorted = points.reversed.toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 6),
          child: Text('ИСТОРИЯ', style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w700)),
        ),
        Container(
          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
          child: Column(
            children: <Widget>[
              for (int i = 0; i < sorted.length; i++) ...<Widget>[
                if (i > 0) Divider(height: 1, color: c.line),
                _row(c, sorted[i]),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _row(AppColors c, ExerciseHistoryPoint p) {
    final List<Widget> metrics = <Widget>[
      Text('${p.totalSets} подх.', style: AppFonts.mono(size: 12, color: c.inkMutedXl)),
    ];
    if (isTimeBased) {
      if (p.maxTimeSec != null) {
        metrics.add(Text.rich(TextSpan(children: <InlineSpan>[
          TextSpan(text: 'PR ', style: AppFonts.mono(size: 12, color: c.inkMuted)),
          TextSpan(text: _fmtSeconds(p.maxTimeSec!), style: AppFonts.mono(size: 12, color: c.ink, weight: FontWeight.w700)),
        ])));
      }
      metrics.add(Text('${_fmtSeconds(p.totalTimeSec)} всего', style: AppFonts.mono(size: 12, color: c.inkMuted)));
    } else {
      if (p.maxWeightKg != null) {
        metrics.add(Text.rich(TextSpan(children: <InlineSpan>[
          if (p.topReps != null)
            TextSpan(text: '${_fmtNum(p.topReps!)} × ', style: AppFonts.mono(size: 12, color: c.ink, weight: FontWeight.w700)),
          TextSpan(text: '${_fmtNum(p.maxWeightKg!)} кг', style: AppFonts.mono(size: 12, color: c.ink, weight: FontWeight.w700)),
        ])));
      }
      metrics.add(Text('${_fmtTonnage(p.tonnage)} тоннаж', style: AppFonts.mono(size: 12, color: c.inkMuted)));
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Expanded(child: Text(_fmtFullDate(p.date), style: TextStyle(fontSize: 13, color: c.inkMuted))),
          Expanded(
            flex: 2,
            child: Wrap(
              alignment: WrapAlignment.end,
              spacing: 10,
              runSpacing: 2,
              children: metrics,
            ),
          ),
        ],
      ),
    );
  }
}
