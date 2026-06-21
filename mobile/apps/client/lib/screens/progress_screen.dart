import 'package:core/core.dart';
import 'package:fl_chart/fl_chart.dart';
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
String _iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String _duration(int sec) {
  if (sec <= 0) return '0';
  final int h = sec ~/ 3600;
  final int m = (sec % 3600) ~/ 60;
  if (h > 0) return '$h ч ${m > 0 ? '$m м' : ''}'.trim();
  return '$m м';
}

enum _Tab { summary, measure, photos }

/// Прогресс: сводка по тренировкам, замеры тела (график + ввод) и фото прогресса.
class ProgressScreen extends ConsumerStatefulWidget {
  const ProgressScreen({super.key});
  @override
  ConsumerState<ProgressScreen> createState() => _ProgressScreenState();
}

class _ProgressScreenState extends ConsumerState<ProgressScreen> {
  _Tab _tab = _Tab.summary;
  String _metric = 'weightKg';

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final bool linked = ref.watch(clientLinkedProvider).valueOrNull ?? false;
    return Scaffold(
      appBar: AppBar(title: const Text('Прогресс')),
      floatingActionButton: (linked && _tab != _Tab.summary)
          ? FloatingActionButton(
              onPressed: () => _tab == _Tab.measure ? _addMeasurement() : _uploadPhoto(),
              child: const Icon(Icons.add),
            )
          : null,
      body: Column(
        children: <Widget>[
          Expanded(child: _body(c)),
          // Нижний переключатель вкладок (one-handed).
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
                child: Row(
                  children: <Widget>[
                    _Seg(label: 'Сводка', active: _tab == _Tab.summary, onTap: () => setState(() => _tab = _Tab.summary)),
                    _Seg(label: 'Замеры', active: _tab == _Tab.measure, onTap: () => setState(() => _tab = _Tab.measure)),
                    _Seg(label: 'Фото', active: _tab == _Tab.photos, onTap: () => setState(() => _tab = _Tab.photos)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _body(AppColors c) {
    switch (_tab) {
      case _Tab.summary:
        return _summary(c);
      case _Tab.measure:
        return _measure(c);
      case _Tab.photos:
        return _photos(c);
    }
  }

  // ─── Сводка ───
  Widget _summary(AppColors c) {
    final AsyncValue<List<Workout>> workouts = ref.watch(clientWorkoutsProvider);
    return workouts.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (Object e, _) => _retry(() => ref.invalidate(clientWorkoutsProvider)),
      data: (List<Workout> all) {
        final ClientStats s = aggregateClientStats(all);
        final List<ExerciseOverview> records =
            aggregateExerciseOverview(all).where((ExerciseOverview e) => e.lastIsRecord).toList();
        if (s.completedWorkouts == 0) {
          return _empty(c, 'Здесь появится статистика после ваших проведённых тренировок.');
        }
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          children: <Widget>[
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 1.5,
              children: <Widget>[
                _Stat(value: '${s.completedWorkouts}', label: 'тренировок'),
                _Stat(value: '${s.tonnageKg}', label: 'кг тоннаж'),
                _Stat(value: '${s.doneSets}', label: 'подходов'),
                _Stat(value: '${s.totalReps}', label: 'повторов'),
                _Stat(value: s.avgRpe != null ? '${s.avgRpe}' : '—', label: 'средний RPE'),
                _Stat(value: _duration(s.totalDurationSec), label: 'в зале'),
              ],
            ),
            if (records.isNotEmpty) ...<Widget>[
              const SizedBox(height: 20),
              _SectionLabel('Свежие рекорды'),
              ...records.take(20).map((ExerciseOverview e) => Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
                    child: Row(
                      children: <Widget>[
                        Icon(Icons.emoji_events, size: 18, color: c.accent),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(e.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                        ),
                        Text(e.isTimeBased ? '${e.maxTimeSec} с' : '${e.maxWeightKg} кг',
                            style: AppFonts.mono(size: 14, color: c.ink)),
                      ],
                    ),
                  )),
            ],
          ],
        );
      },
    );
  }

  // ─── Замеры ───
  Widget _measure(AppColors c) {
    final AsyncValue<List<Measurement>> ms = ref.watch(clientMeasurementsProvider);
    return ms.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (Object e, _) => _retry(() => ref.invalidate(clientMeasurementsProvider)),
      data: (List<Measurement> list) {
        if (list.isEmpty) {
          return _empty(c, 'Замеров пока нет. Добавьте первый — тело по неделям нагляднее в графике.');
        }
        final MetricDef def = kMetrics.firstWhere((MetricDef m) => m.key == _metric, orElse: () => kMetrics.first);
        final List<({DateTime? date, num v})> pts = <({DateTime? date, num v})>[
          for (final Measurement m in list)
            if (m.value(_metric) case final num v) (date: m.date, v: v),
        ];
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          children: <Widget>[
            // Чипы выбора метрики.
            SizedBox(
              height: 36,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: kMetrics
                    .map((MetricDef m) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: _Chip(label: m.label, active: _metric == m.key, onTap: () => setState(() => _metric = m.key)),
                        ))
                    .toList(),
              ),
            ),
            const SizedBox(height: 12),
            if (pts.length >= 2)
              _MetricChart(points: pts, unit: def.unit, color: c.accent)
            else
              Container(
                height: 120,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
                child: Text('Нужно ≥2 замера с «${def.label}» для графика', style: TextStyle(color: c.inkMuted, fontSize: 13)),
              ),
            const SizedBox(height: 16),
            _SectionLabel('История замеров'),
            ...list.reversed.map((Measurement m) => _MeasureCard(m: m, onDelete: () => _deleteMeasurement(m.id))),
          ],
        );
      },
    );
  }

  // ─── Фото ───
  Widget _photos(AppColors c) {
    final AsyncValue<List<ProgressPhoto>> ps = ref.watch(clientPhotosProvider);
    final String? token = ref.watch(sessionProvider).token;
    final ClientPhotosApi api = ref.read(clientPhotosApiProvider);
    return ps.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (Object e, _) => _retry(() => ref.invalidate(clientPhotosProvider)),
      data: (List<ProgressPhoto> list) {
        if (list.isEmpty) {
          return _empty(c, 'Фото прогресса пока нет. Снимайте раз в неделю в одном ракурсе — динамика виднее.');
        }
        return GridView.builder(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3, mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: 0.7),
          itemCount: list.length,
          itemBuilder: (BuildContext ctx, int i) {
            final ProgressPhoto p = list[i];
            return GestureDetector(
              onLongPress: () => _deletePhoto(p),
              child: Stack(
                fit: StackFit.expand,
                children: <Widget>[
                  AuthedImage(url: api.photoUrl(p.fileId), token: token, radius: 12),
                  Positioned(
                    left: 0, right: 0, bottom: 0,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.45),
                        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(12)),
                      ),
                      child: Text(
                        <String>[kAngleLabels[p.angle] ?? p.angle, _shortDate(p.date)].join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  // ─── Действия ───
  Future<void> _addMeasurement() async {
    final bool? saved = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: context.colors.bg,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _MeasureForm(),
    );
    if (saved == true) ref.invalidate(clientMeasurementsProvider);
  }

  Future<void> _deleteMeasurement(String id) async {
    try {
      await ref.read(clientMeasurementsApiProvider).delete(id);
      ref.invalidate(clientMeasurementsProvider);
    } catch (_) {}
  }

  Future<void> _uploadPhoto() async {
    final bool? saved = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: context.colors.bg,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _PhotoForm(),
    );
    if (saved == true) ref.invalidate(clientPhotosProvider);
  }

  Future<void> _deletePhoto(ProgressPhoto p) async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Удалить фото?'),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: context.colors.danger),
            child: const Text('Удалить'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(clientPhotosApiProvider).delete(p.id);
      ref.invalidate(clientPhotosProvider);
    } catch (_) {}
  }

  Widget _empty(AppColors c, String text) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(text, textAlign: TextAlign.center, style: TextStyle(color: c.inkMuted)),
        ),
      );

  Widget _retry(VoidCallback onRetry) =>
      Center(child: FilledButton(onPressed: onRetry, child: const Text('Повторить')));
}

// ─── График метрики ───
class _MetricChart extends StatelessWidget {
  const _MetricChart({required this.points, required this.unit, required this.color});
  final List<({DateTime? date, num v})> points;
  final String unit;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final List<FlSpot> spots = <FlSpot>[
      for (int i = 0; i < points.length; i++) FlSpot(i.toDouble(), points[i].v.toDouble()),
    ];
    final double minY = points.map((e) => e.v).reduce((a, b) => a < b ? a : b).toDouble();
    final double maxY = points.map((e) => e.v).reduce((a, b) => a > b ? a : b).toDouble();
    final double pad = ((maxY - minY).abs() * 0.15).clamp(1, 1000);
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 16, 16, 8),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      child: SizedBox(
        height: 180,
        child: LineChart(
          LineChartData(
            minY: minY - pad,
            maxY: maxY + pad,
            gridData: FlGridData(show: true, drawVerticalLine: false, horizontalInterval: ((maxY - minY).abs() / 3).clamp(1, 100000),
                getDrawingHorizontalLine: (_) => FlLine(color: c.line, strokeWidth: 1)),
            titlesData: FlTitlesData(
              topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              leftTitles: AxisTitles(
                sideTitles: SideTitles(showTitles: true, reservedSize: 38, getTitlesWidget: (double v, _) =>
                    Text(v.toStringAsFixed(0), style: AppFonts.mono(size: 9, color: c.inkMutedXl))),
              ),
              bottomTitles: AxisTitles(
                sideTitles: SideTitles(
                  showTitles: true, reservedSize: 22, interval: 1,
                  getTitlesWidget: (double v, _) {
                    final int i = v.round();
                    if (i < 0 || i >= points.length) return const SizedBox.shrink();
                    if (points.length > 6 && i % (points.length ~/ 6 + 1) != 0) return const SizedBox.shrink();
                    return Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(_shortDate(points[i].date), style: AppFonts.mono(size: 9, color: c.inkMutedXl)),
                    );
                  },
                ),
              ),
            ),
            borderData: FlBorderData(show: false),
            lineBarsData: <LineChartBarData>[
              LineChartBarData(
                spots: spots,
                isCurved: true,
                color: color,
                barWidth: 3,
                dotData: FlDotData(show: points.length <= 12),
                belowBarData: BarAreaData(show: true, color: color.withValues(alpha: 0.12)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MeasureCard extends StatelessWidget {
  const _MeasureCard({required this.m, required this.onDelete});
  final Measurement m;
  final VoidCallback onDelete;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final List<String> parts = <String>[
      for (final MetricDef d in kMetrics)
        if (m.value(d.key) case final num v) '${d.label} $v${d.unit == '%' ? '%' : ''}',
    ];
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 10, 8, 12),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Text(_shortDate(m.date), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.ink)),
              const Spacer(),
              GestureDetector(onTap: onDelete, child: Icon(Icons.delete_outline, size: 18, color: c.inkMuted)),
            ],
          ),
          if (parts.isNotEmpty) ...<Widget>[
            const SizedBox(height: 4),
            Text(parts.join(' · '),
                style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
          ],
          if (m.note?.isNotEmpty == true) ...<Widget>[
            const SizedBox(height: 4),
            Text(m.note!, style: TextStyle(fontSize: 13, color: c.ink)),
          ],
        ],
      ),
    );
  }
}

// ─── Форма замера ───
class _MeasureForm extends ConsumerStatefulWidget {
  const _MeasureForm();
  @override
  ConsumerState<_MeasureForm> createState() => _MeasureFormState();
}

class _MeasureFormState extends ConsumerState<_MeasureForm> {
  final Map<String, TextEditingController> _ctrls = <String, TextEditingController>{
    for (final MetricDef m in kMetrics) m.key: TextEditingController(),
  };
  final TextEditingController _note = TextEditingController();
  DateTime _date = DateTime.now();
  bool _busy = false;

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
    final Map<String, dynamic> body = <String, dynamic>{'date': _iso(_date)};
    for (final MetricDef m in kMetrics) {
      final num? v = _n(_ctrls[m.key]!.text);
      if (v != null) body[m.key] = v;
    }
    if (_note.text.trim().isNotEmpty) body['note'] = _note.text.trim();
    if (body.length == 1 || _busy) return; // только дата — нечего сохранять
    setState(() => _busy = true);
    final NavigatorState nav = Navigator.of(context);
    final ScaffoldMessengerState msg = ScaffoldMessenger.of(context);
    try {
      await ref.read(clientMeasurementsApiProvider).create(body);
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      msg.showSnackBar(const SnackBar(content: Text('Не удалось сохранить замер')));
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
              Text('Новый замер', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: c.ink)),
              const Spacer(),
              GestureDetector(
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
                    Text('${_date.day} ${_ruMonths[_date.month - 1]}', style: TextStyle(fontSize: 13, color: c.ink)),
                  ]),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                children: <Widget>[
                  GridView.count(
                    crossAxisCount: 3,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                    childAspectRatio: 1.5,
                    children: kMetrics.map((MetricDef m) => _NumField(label: '${m.label}, ${m.unit}', ctrl: _ctrls[m.key]!)).toList(),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _note,
                    decoration: InputDecoration(
                      hintText: 'Заметка (необязательно)',
                      filled: true, fillColor: c.card,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _busy ? null : _save,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            child: const Text('Сохранить замер'),
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.center,
      children: <Widget>[
        Text(label.toUpperCase(), maxLines: 1, overflow: TextOverflow.ellipsis,
            style: AppFonts.mono(size: 9, color: c.inkMutedXl, weight: FontWeight.w600)),
        const SizedBox(height: 4),
        SizedBox(
          height: 38,
          child: TextField(
            controller: ctrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
            textAlign: TextAlign.center,
            style: AppFonts.mono(size: 15, color: c.ink, weight: FontWeight.w600),
            decoration: InputDecoration(
              isDense: true, filled: true, fillColor: c.chip,
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

// ─── Форма фото ───
class _PhotoForm extends ConsumerStatefulWidget {
  const _PhotoForm();
  @override
  ConsumerState<_PhotoForm> createState() => _PhotoFormState();
}

class _PhotoFormState extends ConsumerState<_PhotoForm> {
  String _angle = 'front';
  DateTime _date = DateTime.now();
  XFile? _file;
  bool _busy = false;

  Future<void> _pick() async {
    final XFile? p = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1600, imageQuality: 85);
    if (p != null) setState(() => _file = p);
  }

  Future<void> _save() async {
    if (_file == null || _busy) return;
    setState(() => _busy = true);
    final NavigatorState nav = Navigator.of(context);
    final ScaffoldMessengerState msg = ScaffoldMessenger.of(context);
    try {
      await ref.read(clientPhotosApiProvider).upload(
          date: _iso(_date), angle: _angle, filePath: _file!.path, fileName: _file!.name);
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      msg.showSnackBar(const SnackBar(content: Text('Не удалось загрузить фото')));
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
          Text('Фото прогресса', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: c.ink)),
          const SizedBox(height: 12),
          Row(
            children: kAngleLabels.entries
                .map((MapEntry<String, String> e) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: _Chip(label: e.value, active: _angle == e.key, onTap: () => setState(() => _angle = e.key)),
                    ))
                .toList(),
          ),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: _pick,
            child: Container(
              height: 160,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: c.card, borderRadius: BorderRadius.circular(16),
                border: Border.all(color: c.line, width: _file == null ? 2 : 0),
              ),
              child: _file == null
                  ? Column(mainAxisSize: MainAxisSize.min, children: <Widget>[
                      Icon(Icons.add_a_photo_outlined, size: 28, color: c.inkMuted),
                      const SizedBox(height: 8),
                      Text('Выбрать фото', style: TextStyle(color: c.inkMuted, fontSize: 13)),
                    ])
                  : ClipRRect(borderRadius: BorderRadius.circular(14), child: Image.network(_file!.path, fit: BoxFit.cover, width: double.infinity,
                      errorBuilder: (_, _, _) => Icon(Icons.check_circle, color: c.accent, size: 32))),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: <Widget>[
              GestureDetector(
                onTap: () async {
                  final DateTime now = DateTime.now();
                  final DateTime? d = await showDatePicker(
                    context: context, initialDate: _date, firstDate: DateTime(now.year - 5), lastDate: now);
                  if (d != null) setState(() => _date = d);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: <Widget>[
                    Icon(Icons.event, size: 16, color: c.inkMuted),
                    const SizedBox(width: 8),
                    Text('${_date.day} ${_ruMonths[_date.month - 1]}', style: TextStyle(fontSize: 13, color: c.ink)),
                  ]),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton(
                  onPressed: (_busy || _file == null) ? null : _save,
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                  child: const Text('Загрузить'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Общие виджеты ───
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
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.5, color: context.colors.inkMutedXl)),
      );
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});
  final String value;
  final String label;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(18), border: Border.all(color: c.line)),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: AppFonts.display(size: 30, color: c.accent, letterSpacing: -1)),
          ),
          const SizedBox(height: 2),
          Text(label.toUpperCase(), style: AppFonts.mono(size: 10, color: c.inkMuted, weight: FontWeight.w700)),
        ],
      ),
    );
  }
}
