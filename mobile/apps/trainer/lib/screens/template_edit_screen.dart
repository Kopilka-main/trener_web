import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_assign.dart';
import '../api/trainer_catalog.dart';

/// Одна позиция упражнения в шаблоне (один «подход» = одна карточка).
class _Pos {
  _Pos({
    required this.exerciseId,
    required this.exerciseName,
    required this.timeBased,
    this.reps,
    this.weightKg,
    this.timeSec,
    this.restSec,
  });
  final String exerciseId;
  final String exerciseName;
  final bool timeBased;
  num? reps;
  num? weightKg;
  num? timeSec;
  num? restSec;

  Map<String, dynamic> toPayload() => <String, dynamic>{
        'exerciseId': exerciseId,
        'sets': 1,
        'reps': reps,
        'weightKg': weightKg,
        'timeSec': timeSec,
        'restSec': restSec ?? 90,
      };
}

/// Создание/правка шаблона тренировки. Зеркало веб TemplateEditPage:
/// шаг 1 — выбор упражнений (счётчик подходов), шаг 2 — детали + порядок + сохранить.
class TemplateEditScreen extends ConsumerStatefulWidget {
  const TemplateEditScreen({super.key, this.template});
  final WorkoutTemplate? template;

  @override
  ConsumerState<TemplateEditScreen> createState() => _TemplateEditScreenState();
}

class _TemplateEditScreenState extends ConsumerState<TemplateEditScreen> {
  late final TextEditingController _name;
  late final TextEditingController _desc;
  String? _tag;
  final List<_Pos> _positions = <_Pos>[];
  bool _busy = false;
  bool _step1 = false; // true → экран выбора упражнений

  bool get _isEdit => widget.template != null;

  @override
  void initState() {
    super.initState();
    final WorkoutTemplate? t = widget.template;
    _name = TextEditingController(text: t?.name ?? '');
    _desc = TextEditingController(text: t?.shortDescription ?? '');
    _tag = t?.categoryTag;
    if (t != null) {
      for (final TemplateExercise e in t.exercises) {
        _positions.add(_Pos(
          exerciseId: e.exerciseId,
          exerciseName: e.exerciseName,
          timeBased: e.timeSec != null && e.reps == null,
          reps: e.reps,
          weightKg: e.weightKg,
          timeSec: e.timeSec,
          restSec: e.restSec,
        ));
      }
    } else {
      _step1 = true; // новый шаблон начинаем с выбора
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _desc.dispose();
    super.dispose();
  }

  void _addFromCatalog(TExercise ex, int count) {
    final bool timeBased = ex.defaultTimeSec != null && ex.defaultReps == null;
    for (int i = 0; i < count; i++) {
      _positions.add(_Pos(
        exerciseId: ex.id,
        exerciseName: ex.name,
        timeBased: timeBased,
        reps: timeBased ? null : ex.defaultReps,
        weightKg: timeBased ? null : ex.defaultWeightKg,
        timeSec: timeBased ? ex.defaultTimeSec : null,
        restSec: ex.restSec ?? 90,
      ));
    }
  }

  Future<void> _save() async {
    final String name = _name.text.trim();
    if (name.isEmpty || _positions.isEmpty || _busy) return;
    setState(() => _busy = true);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    final NavigatorState nav = Navigator.of(context);
    final TrainerCatalogApi api = ref.read(trainerCatalogApiProvider);
    final Map<String, dynamic> body = <String, dynamic>{
      'name': name,
      'categoryTag': _tag,
      'shortDescription': _desc.text.trim().isEmpty ? null : _desc.text.trim(),
      'exercises': _positions.map((_Pos p) => p.toPayload()).toList(),
    };
    try {
      if (_isEdit) {
        await api.updateTemplate(widget.template!.id, body);
      } else {
        await api.createTemplate(body);
      }
      ref.invalidate(trainerTemplatesProvider);
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось сохранить шаблон')));
    }
  }

  Future<void> _delete() async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Удалить шаблон?'),
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
      await ref.read(trainerCatalogApiProvider).deleteTemplate(widget.template!.id);
      ref.invalidate(trainerTemplatesProvider);
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_step1) {
      return _ExerciseSelect(
        initialCounts: _countByExercise(),
        onCancel: () {
          if (_positions.isEmpty && !_isEdit) {
            Navigator.of(context).pop();
          } else {
            setState(() => _step1 = false);
          }
        },
        onDone: (Map<String, int> counts, List<TExercise> catalog) {
          setState(() {
            // полностью пересобираем по счётчикам (сохраняя редактируемые значения нельзя — упрощённо)
            _positions.clear();
            for (final TExercise ex in catalog) {
              final int n = counts[ex.id] ?? 0;
              if (n > 0) _addFromCatalog(ex, n);
            }
            _step1 = false;
          });
        },
      );
    }
    return _buildDetails(context);
  }

  Map<String, int> _countByExercise() {
    final Map<String, int> m = <String, int>{};
    for (final _Pos p in _positions) {
      m[p.exerciseId] = (m[p.exerciseId] ?? 0) + 1;
    }
    return m;
  }

  Widget _buildDetails(BuildContext context) {
    final AppColors c = context.colors;
    return Scaffold(
      appBar: AppBar(
        title: Text(_isEdit ? 'Шаблон' : 'Новый шаблон'),
        actions: <Widget>[
          TextButton(
            onPressed: (_busy || _name.text.trim().isEmpty || _positions.isEmpty) ? null : _save,
            child: const Text('Сохранить'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: <Widget>[
          _Label('Название'),
          TextField(
            controller: _name,
            onChanged: (_) => setState(() {}),
            decoration: _dec(c, 'Верх · Сила'),
          ),
          const SizedBox(height: 16),
          _Label('Описание'),
          TextField(
            controller: _desc,
            maxLines: 2,
            decoration: _dec(c, 'Силовая на верх — грудь, спина, плечи'),
          ),
          const SizedBox(height: 16),
          _Label('Тип'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: <Widget>[
              _Chip(label: '—', active: _tag == null, onTap: () => setState(() => _tag = null)),
              ...kTemplateTags.map((String t) => _Chip(
                    label: t,
                    active: _tag == t,
                    onTap: () => setState(() => _tag = t),
                  )),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: <Widget>[
              _Label('Упражнения · ${_positions.length}'),
              const Spacer(),
              TextButton.icon(
                onPressed: () => setState(() => _step1 = true),
                icon: const Icon(Icons.edit, size: 16),
                label: const Text('Изменить состав'),
              ),
            ],
          ),
          ReorderableListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _positions.length,
            onReorderItem: (int oldI, int newI) {
              setState(() {
                final _Pos moved = _positions.removeAt(oldI);
                _positions.insert(newI, moved);
              });
            },
            itemBuilder: (BuildContext ctx, int i) {
              final _Pos p = _positions[i];
              return _PositionCard(
                key: ValueKey<int>(i),
                pos: p,
                index: i + 1,
                onChanged: () => setState(() {}),
                onRemove: () => setState(() => _positions.removeAt(i)),
              );
            },
          ),
          if (_isEdit) ...<Widget>[
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: _busy ? null : _delete,
              icon: Icon(Icons.delete_outline, size: 18, color: c.danger),
              label: Text('Удалить шаблон', style: TextStyle(color: c.danger)),
              style: OutlinedButton.styleFrom(side: BorderSide(color: c.line)),
            ),
          ],
        ],
      ),
    );
  }
}

/// Карточка позиции: поля плана (повторы/вес или время + отдых).
class _PositionCard extends StatefulWidget {
  const _PositionCard({super.key, required this.pos, required this.index, required this.onChanged, required this.onRemove});
  final _Pos pos;
  final int index;
  final VoidCallback onChanged;
  final VoidCallback onRemove;

  @override
  State<_PositionCard> createState() => _PositionCardState();
}

class _PositionCardState extends State<_PositionCard> {
  late final TextEditingController _reps;
  late final TextEditingController _weight;
  late final TextEditingController _time;
  late final TextEditingController _rest;

  @override
  void initState() {
    super.initState();
    final _Pos p = widget.pos;
    _reps = TextEditingController(text: p.reps?.toString() ?? '');
    _weight = TextEditingController(text: p.weightKg?.toString() ?? '');
    _time = TextEditingController(text: p.timeSec?.toString() ?? '');
    _rest = TextEditingController(text: p.restSec?.toString() ?? '');
  }

  @override
  void dispose() {
    _reps.dispose();
    _weight.dispose();
    _time.dispose();
    _rest.dispose();
    super.dispose();
  }

  num? _n(String s) => num.tryParse(s.trim().replaceAll(',', '.'));

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final _Pos p = widget.pos;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text('${widget.index}. ${p.exerciseName}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
              ),
              GestureDetector(
                onTap: widget.onRemove,
                child: Icon(Icons.delete_outline, size: 18, color: c.inkMuted),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: <Widget>[
              if (p.timeBased)
                _Num(label: 'Время, с', ctrl: _time, onChanged: (String v) { p.timeSec = _n(v); widget.onChanged(); })
              else ...<Widget>[
                _Num(label: 'Повторы', ctrl: _reps, onChanged: (String v) { p.reps = _n(v); widget.onChanged(); }),
                const SizedBox(width: 8),
                _Num(label: 'Вес, кг', ctrl: _weight, onChanged: (String v) { p.weightKg = _n(v); widget.onChanged(); }),
              ],
              const SizedBox(width: 8),
              _Num(label: 'Отдых, с', ctrl: _rest, onChanged: (String v) { p.restSec = _n(v); widget.onChanged(); }),
            ],
          ),
        ],
      ),
    );
  }
}

/// Шаг 1: выбор упражнений со счётчиком подходов.
class _ExerciseSelect extends ConsumerStatefulWidget {
  const _ExerciseSelect({required this.initialCounts, required this.onCancel, required this.onDone});
  final Map<String, int> initialCounts;
  final VoidCallback onCancel;
  final void Function(Map<String, int> counts, List<TExercise> catalog) onDone;

  @override
  ConsumerState<_ExerciseSelect> createState() => _ExerciseSelectState();
}

class _ExerciseSelectState extends ConsumerState<_ExerciseSelect> {
  late final Map<String, int> _counts = Map<String, int>.from(widget.initialCounts);
  String _query = '';
  String _group = '';
  String _subgroup = '';
  final TextEditingController _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final String base = ref.read(baseUrlProvider);
    final AsyncValue<List<TExercise>> catalog = ref.watch(trainerCatalogProvider);
    final int total = _counts.values.fold<int>(0, (int a, int b) => a + b);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.close), onPressed: widget.onCancel),
        title: const Text('Выбор упражнений'),
        actions: <Widget>[
          TextButton(
            onPressed: total == 0
                ? null
                : () => widget.onDone(_counts, catalog.valueOrNull ?? <TExercise>[]),
            child: Text('Далее ($total)'),
          ),
        ],
      ),
      body: catalog.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => Center(child: Text('Не удалось загрузить каталог', style: TextStyle(color: c.inkMuted))),
        data: (List<TExercise> all) {
          final List<String> groups = <String>{
            for (final TExercise e in all)
              if (e.category.isNotEmpty) e.category,
          }.toList()
            ..sort();
          // Подгруппы выбранной группы (присутствующие в каталоге) — второй уровень чипов.
          final List<String> subgroups = _group.isEmpty
              ? <String>[]
              : (<String>{
                  for (final TExercise e in all)
                    if (e.category == _group && (e.subgroup?.trim().isNotEmpty ?? false))
                      e.subgroup!,
                }.toList()
                ..sort());
          final List<TExercise> filtered = all.where((TExercise e) {
            if (_group.isNotEmpty && e.category != _group) return false;
            if (_subgroup.isNotEmpty && e.subgroup != _subgroup) return false;
            return true;
          }).toList();
          // Поиск/ранжирование как в вебе (rankBySearch): ё→е, слова в любом
          // порядке, префикс/подстрока/опечатка, сортировка по релевантности.
          final List<TExercise> list = rankBySearch(filtered, _query, (TExercise e) => e.name);
          return Column(
            children: <Widget>[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                child: TextField(
                  controller: _searchCtrl,
                  onChanged: (String v) => setState(() => _query = v),
                  decoration: InputDecoration(
                    hintText: 'Поиск упражнения',
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
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                  ),
                ),
              ),
              if (groups.isNotEmpty)
                SizedBox(
                  height: 38,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    children: <Widget>[
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: _Chip(
                            label: 'Все',
                            active: _group.isEmpty,
                            onTap: () => setState(() {
                                  _group = '';
                                  _subgroup = '';
                                })),
                      ),
                      ...groups.map((String g) => Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: _Chip(
                                label: g,
                                active: _group == g,
                                onTap: () => setState(() {
                                      _group = g;
                                      _subgroup = '';
                                    })),
                          )),
                    ],
                  ),
                ),
              // Второй уровень — подгруппы выбранной группы.
              if (subgroups.isNotEmpty) const SizedBox(height: 8),
              if (subgroups.isNotEmpty)
                SizedBox(
                  height: 34,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 2),
                    children: <Widget>[
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: _Chip(
                            label: 'Все',
                            active: _subgroup.isEmpty,
                            onTap: () => setState(() => _subgroup = '')),
                      ),
                      ...subgroups.map((String s) => Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: _Chip(
                                label: s,
                                active: _subgroup == s,
                                onTap: () => setState(() => _subgroup = s)),
                          )),
                    ],
                  ),
                ),
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  itemCount: list.length,
                  itemBuilder: (BuildContext ctx, int i) {
                    final TExercise ex = list[i];
                    final int n = _counts[ex.id] ?? 0;
                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
                      decoration: BoxDecoration(
                        color: c.card,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: n > 0 ? c.accent : c.line),
                      ),
                      child: Row(
                        children: <Widget>[
                          Expanded(
                            child: GestureDetector(
                              onTap: () => _showExerciseInfo(context, ex, base),
                              behavior: HitTestBehavior.opaque,
                              child: Row(
                                children: <Widget>[
                                  CatalogThumb(
                                      url: catalogMediaUrl(base, ex.thumbUrl ?? ex.imageUrl),
                                      size: 42),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: <Widget>[
                                        Text(ex.name,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                                fontSize: 15,
                                                fontWeight: FontWeight.w600,
                                                color: c.ink)),
                                        if (ex.category.isNotEmpty ||
                                            (ex.subgroup?.isNotEmpty ?? false))
                                          Text(
                                              <String>[
                                                if (ex.category.isNotEmpty) ex.category,
                                                if (ex.subgroup?.trim().isNotEmpty ?? false)
                                                  ex.subgroup!,
                                              ].join(' · '),
                                              style: AppFonts.mono(
                                                  size: 12,
                                                  color: c.inkMuted,
                                                  weight: FontWeight.w500)),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          _Round(icon: Icons.remove, onTap: n == 0 ? null : () => setState(() {
                                final int next = n - 1;
                                if (next <= 0) {
                                  _counts.remove(ex.id);
                                } else {
                                  _counts[ex.id] = next;
                                }
                              })),
                          SizedBox(width: 34, child: Text('$n', textAlign: TextAlign.center, style: AppFonts.mono(size: 16, color: c.ink, weight: FontWeight.w700))),
                          _Round(icon: Icons.add, onTap: () => setState(() => _counts[ex.id] = n + 1)),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Карточка-подсказка об упражнении (по тапу в выборе): видео/фото с
/// переключателем, название, описание, группы мышц.
void _showExerciseInfo(BuildContext context, TExercise ex, String base) {
  final AppColors c = context.colors;
  final String? img = catalogMediaUrl(base, ex.imageUrl ?? ex.thumbUrl);
  final String? video = catalogMediaUrl(base, ex.videoUrl);
  final List<MapEntry<String, String>> chars = <MapEntry<String, String>>[
    if ((ex.equipment ?? '').trim().isNotEmpty)
      MapEntry<String, String>('Оборудование', ex.equipment!.trim()),
    if ((ex.primaryMuscles ?? '').trim().isNotEmpty)
      MapEntry<String, String>('Целевые мышцы', ex.primaryMuscles!.trim()),
    if ((ex.secondaryMuscles ?? '').trim().isNotEmpty)
      MapEntry<String, String>('Дополнительно', ex.secondaryMuscles!.trim()),
  ];
  final bool hasDesc = (ex.description ?? '').trim().isNotEmpty;

  showModalBottomSheet<void>(
    context: context,
    backgroundColor: c.bg,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (BuildContext ctx) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      builder: (BuildContext ctx, ScrollController sc) => ListView(
        controller: sc,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: <Widget>[
          if (img != null || video != null)
            CatalogMediaView(imageUrl: img, videoUrl: video, height: 200, showToggle: true),
          const SizedBox(height: 14),
          Text(ex.name, style: AppFonts.display(size: 22, color: c.ink)),
          if (ex.category.isNotEmpty || (ex.subgroup?.isNotEmpty ?? false)) ...<Widget>[
            const SizedBox(height: 4),
            Text(
                <String>[
                  if (ex.category.isNotEmpty) ex.category,
                  if (ex.subgroup?.trim().isNotEmpty ?? false) ex.subgroup!,
                ].join(' · '),
                style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w600)),
          ],
          const SizedBox(height: 16),
          Text('ОПИСАНИЕ',
              style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(hasDesc ? ex.description!.trim() : 'Описание не задано',
              style: TextStyle(
                  fontSize: 14, height: 1.45, color: hasDesc ? c.ink : c.inkMuted)),
          if (chars.isNotEmpty) ...<Widget>[
            const SizedBox(height: 18),
            Text('ГРУППЫ МЫШЦ',
                style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w700)),
            const SizedBox(height: 6),
            Container(
              decoration: BoxDecoration(
                color: c.card,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: c.line),
              ),
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: <Widget>[
                  for (int i = 0; i < chars.length; i++) ...<Widget>[
                    if (i > 0) Divider(height: 1, thickness: 1, color: c.line),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          SizedBox(
                              width: 120,
                              child: Text(chars[i].key,
                                  style: TextStyle(fontSize: 13, color: c.inkMuted))),
                          Expanded(
                              child: Text(chars[i].value,
                                  style: TextStyle(fontSize: 14, color: c.ink))),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    ),
  );
}

// ─── Общие виджеты ───

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
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(color: active ? c.accent : c.chip, borderRadius: BorderRadius.circular(20)),
        child: Text(label,
            style: AppFonts.mono(size: 12, color: active ? c.accentOn : c.inkMuted, weight: FontWeight.w600)),
      ),
    );
  }
}

class _Num extends StatelessWidget {
  const _Num({required this.label, required this.ctrl, required this.onChanged});
  final String label;
  final TextEditingController ctrl;
  final ValueChanged<String> onChanged;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(label.toUpperCase(), style: AppFonts.mono(size: 10, color: c.inkMuted, weight: FontWeight.w500)),
          const SizedBox(height: 4),
          SizedBox(
            height: 40,
            child: TextField(
              controller: ctrl,
              onChanged: onChanged,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
              textAlign: TextAlign.center,
              style: AppFonts.mono(size: 15, color: c.ink, weight: FontWeight.w500),
              decoration: InputDecoration(
                isDense: true,
                filled: true,
                fillColor: c.chip,
                contentPadding: const EdgeInsets.symmetric(vertical: 8),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.line)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.line)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.accent)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Round extends StatelessWidget {
  const _Round({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(color: c.card, shape: BoxShape.circle, border: Border.all(color: c.line)),
        child: Icon(icon, size: 18, color: onTap == null ? c.inkMutedXl : c.ink),
      ),
    );
  }
}
