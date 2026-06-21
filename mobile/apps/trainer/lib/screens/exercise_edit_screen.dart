import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_assign.dart';
import '../api/trainer_catalog.dart';

/// Создание/правка упражнения каталога. Зеркало веб ExerciseEditPage.
/// Глобальное (системное) упражнение редактируется как личная копия.
class ExerciseEditScreen extends ConsumerStatefulWidget {
  const ExerciseEditScreen({super.key, this.exercise});
  final TExercise? exercise;

  @override
  ConsumerState<ExerciseEditScreen> createState() => _ExerciseEditScreenState();
}

class _ExerciseEditScreenState extends ConsumerState<ExerciseEditScreen> {
  late final TextEditingController _name;
  late final TextEditingController _desc;
  String _category = '';
  String? _subgroup;
  late int _reps;
  late num _weight;
  late int _time;
  late int _rest;
  bool _busy = false;

  TExercise? get _src => widget.exercise;
  bool get _isEdit => _src != null;
  bool get _isGlobal => _src?.isGlobal ?? false;

  @override
  void initState() {
    super.initState();
    final TExercise? e = _src;
    _name = TextEditingController(text: e?.name ?? '');
    _desc = TextEditingController(text: e?.description ?? '');
    _category = e?.category ?? '';
    _subgroup = e?.subgroup;
    _reps = (e?.defaultReps ?? 10).toInt();
    _weight = e?.defaultWeightKg ?? 0;
    _time = (e?.defaultTimeSec ?? 0).toInt();
    _rest = (e?.restSec ?? 90).toInt();
  }

  @override
  void dispose() {
    _name.dispose();
    _desc.dispose();
    super.dispose();
  }

  List<String> get _groups {
    final List<String> all = ref.read(trainerCatalogProvider).valueOrNull
            ?.map((TExercise e) => e.category)
            .where((String s) => s.isNotEmpty)
            .toSet()
            .toList() ??
        <String>[];
    final List<String> ordered = <String>[
      ...kGroupOrder.where((String g) => all.contains(g) || kGroupOrder.contains(g)),
    ];
    for (final String g in all) {
      if (!ordered.contains(g)) ordered.add(g);
    }
    if (_category.isNotEmpty && !ordered.contains(_category)) ordered.add(_category);
    return ordered;
  }

  /// Характеристики каталога (read-only): только непустые поля.
  /// Зеркало веб ExerciseDetails: оборудование / целевые мышцы / дополнительно.
  List<(String, String)> get _chars {
    final TExercise? e = _src;
    final List<(String, String)> rows = <(String, String)>[];
    if (e?.equipment?.trim().isNotEmpty == true) rows.add(('Оборудование', e!.equipment!.trim()));
    if (e?.primaryMuscles?.trim().isNotEmpty == true) rows.add(('Целевые мышцы', e!.primaryMuscles!.trim()));
    if (e?.secondaryMuscles?.trim().isNotEmpty == true) rows.add(('Дополнительно', e!.secondaryMuscles!.trim()));
    return rows;
  }

  Future<void> _save() async {
    final String name = _name.text.trim();
    if (name.isEmpty || _category.isEmpty || _busy) return;
    setState(() => _busy = true);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    final NavigatorState nav = Navigator.of(context);
    final TrainerCatalogApi api = ref.read(trainerCatalogApiProvider);
    final Map<String, dynamic> body = <String, dynamic>{
      'name': name,
      'category': _category,
      'subgroup': _subgroup,
      'description': _desc.text.trim().isEmpty ? null : _desc.text.trim(),
      'defaultReps': _reps > 0 ? _reps : null,
      'defaultWeightKg': _weight > 0 ? _weight : null,
      'defaultTimeSec': _time > 0 ? _time : null,
      'restSec': _rest,
    };
    try {
      if (_isEdit && !_isGlobal) {
        await api.updateExercise(_src!.id, body);
      } else {
        // create, либо личная копия системного (sourceExerciseId — перенос медиа).
        if (_isGlobal) body['sourceExerciseId'] = _src!.id;
        await api.createExercise(body);
      }
      ref.invalidate(trainerCatalogProvider);
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось сохранить упражнение')));
    }
  }

  Future<void> _delete() async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Удалить упражнение?'),
        content: const Text('Действие необратимо.'),
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
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    final NavigatorState nav = Navigator.of(context);
    try {
      await ref.read(trainerCatalogApiProvider).deleteExercise(_src!.id);
      ref.invalidate(trainerCatalogProvider);
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final bool locked = _isGlobal; // системное: имя/группа/описание заблокированы
    final List<String> subs = subgroupsFor(_category);
    final String base = ref.read(baseUrlProvider);
    final String? img = catalogMediaUrl(base, _src?.imageUrl ?? _src?.thumbUrl);
    final String? video = catalogMediaUrl(base, _src?.videoUrl);

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEdit ? 'Упражнение' : 'Новое упражнение'),
        actions: <Widget>[
          TextButton(
            onPressed: (_busy || _name.text.trim().isEmpty || _category.isEmpty) ? null : _save,
            child: const Text('Сохранить'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: <Widget>[
          if (locked)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
              child: Text('Системное упражнение. Сохранение создаст вашу личную копию.',
                  style: TextStyle(fontSize: 13, color: c.inkMuted)),
            ),
          _Label('Группа мышц'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _groups
                .map((String g) => _Chip(
                      label: g,
                      active: _category == g,
                      onTap: locked ? null : () => setState(() {
                            _category = g;
                            if (!subgroupsFor(g).contains(_subgroup)) _subgroup = null;
                          }),
                    ))
                .toList(),
          ),
          if (subs.isNotEmpty) ...<Widget>[
            const SizedBox(height: 16),
            _Label('Подгруппа'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: <Widget>[
                _Chip(label: '—', active: _subgroup == null, onTap: locked ? null : () => setState(() => _subgroup = null)),
                ...subs.map((String s) => _Chip(
                      label: s,
                      active: _subgroup == s,
                      onTap: locked ? null : () => setState(() => _subgroup = s),
                    )),
              ],
            ),
          ],
          const SizedBox(height: 16),
          _Label('Название'),
          TextField(
            controller: _name,
            enabled: !locked,
            onChanged: (_) => setState(() {}),
            decoration: _dec(c, 'Жим ногами под углом 45°'),
          ),
          if (_isEdit && (img != null || video != null)) ...<Widget>[
            const SizedBox(height: 20),
            CatalogMediaView(imageUrl: img, videoUrl: video, height: 200, showToggle: true),
          ],
          if (_isEdit) ...<Widget>[
            if (_chars.isNotEmpty) ...<Widget>[
              const SizedBox(height: 20),
              _Label('Характеристики'),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: c.card,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: c.line),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    for (int i = 0; i < _chars.length; i++) ...<Widget>[
                      if (i > 0) const SizedBox(height: 8),
                      _CharRow(label: _chars[i].$1, value: _chars[i].$2),
                    ],
                  ],
                ),
              ),
            ],
          ],
          const SizedBox(height: 16),
          _Label('Описание'),
          TextField(
            controller: _desc,
            enabled: !locked,
            maxLines: 3,
            decoration: _dec(c, 'Техника, нюансы, на что обратить внимание'),
          ),
          const SizedBox(height: 20),
          _Label('Дефолты подхода'),
          _Stepper(label: 'Повторы', value: _reps.toDouble(), step: 1, onChanged: (double v) => setState(() => _reps = v.toInt())),
          _Stepper(label: 'Вес, кг', value: _weight.toDouble(), step: 2.5, onChanged: (double v) => setState(() => _weight = v)),
          _Stepper(label: 'Время, с', value: _time.toDouble(), step: 5, onChanged: (double v) => setState(() => _time = v.toInt())),
          _Stepper(label: 'Отдых, с', value: _rest.toDouble(), step: 15, min: 0, max: 3600, onChanged: (double v) => setState(() => _rest = v.toInt())),
          if (_isEdit && !_isGlobal) ...<Widget>[
            const SizedBox(height: 24),
            OutlinedButton.icon(
              onPressed: _busy ? null : _delete,
              icon: Icon(Icons.delete_outline, size: 18, color: c.danger),
              label: Text('Удалить упражнение', style: TextStyle(color: c.danger)),
              style: OutlinedButton.styleFrom(side: BorderSide(color: c.line)),
            ),
          ],
        ],
      ),
    );
  }
}

InputDecoration _dec(AppColors c, String hint) => InputDecoration(
      hintText: hint,
      filled: true,
      fillColor: c.card,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
    );

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text.toUpperCase(),
            style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.5, color: context.colors.inkMutedXl)),
      );
}

class _CharRow extends StatelessWidget {
  const _CharRow({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        SizedBox(
          width: 120,
          child: Text(label, style: TextStyle(fontSize: 14, color: c.inkMuted)),
        ),
        const SizedBox(width: 12),
        Expanded(child: Text(value, style: TextStyle(fontSize: 14, color: c.ink))),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
            color: active ? c.accent : c.chip, borderRadius: BorderRadius.circular(20)),
        child: Text(label,
            style: AppFonts.mono(
                size: 12, color: active ? c.accentOn : (onTap == null ? c.inkMutedXl : c.inkMuted), weight: FontWeight.w600)),
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.label,
    required this.value,
    required this.step,
    required this.onChanged,
    this.min = 0,
    this.max = 100000,
  });
  final String label;
  final double value;
  final double step;
  final double min;
  final double max;
  final ValueChanged<double> onChanged;

  String get _fmt => value == value.roundToDouble() ? value.toInt().toString() : value.toString();

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: <Widget>[
          Expanded(child: Text(label, style: TextStyle(fontSize: 14, color: c.ink))),
          _Round(icon: Icons.remove, onTap: () => onChanged((value - step).clamp(min, max))),
          SizedBox(
            width: 64,
            child: Text(_fmt, textAlign: TextAlign.center, style: AppFonts.mono(size: 17, color: c.ink, weight: FontWeight.w700)),
          ),
          _Round(icon: Icons.add, onTap: () => onChanged((value + step).clamp(min, max))),
        ],
      ),
    );
  }
}

class _Round extends StatelessWidget {
  const _Round({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(color: c.card, shape: BoxShape.circle, border: Border.all(color: c.line)),
        child: Icon(icon, size: 18, color: c.ink),
      ),
    );
  }
}
