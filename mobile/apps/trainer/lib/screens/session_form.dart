import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_assign.dart';
import '../api/trainer_calendar.dart';
import '../api/trainer_catalog.dart';
import '../api/trainer_clients.dart';
import '../api/trainer_gyms.dart';
import '../api/trainer_home.dart';

/// Выбор тренировки-плана для занятия: уже привязанная (existing) или шаблон.
class _WorkoutPick {
  _WorkoutPick.existing(this.existingId, this.name) : template = null;
  _WorkoutPick.template(WorkoutTemplate t)
      : template = t,
        name = t.name,
        existingId = null;
  final String? existingId;
  final WorkoutTemplate? template;
  final String name;
}

/// План из шаблона → тело exercises для POST /clients/:id/workouts.
/// sets=N в шаблоне разворачиваем в N отдельных подходов (как в вебе) — иначе
/// тоннаж/счётчик подходов считались бы по одному подходу.
List<Map<String, dynamic>> _bodyFromTemplate(WorkoutTemplate t) => t.exercises
    .expand((TemplateExercise e) => List<Map<String, dynamic>>.generate(
          e.sets < 1 ? 1 : e.sets,
          (_) => <String, dynamic>{
            'exerciseId': e.exerciseId,
            'sets': <Map<String, dynamic>>[
              <String, dynamic>{
                'plannedReps': ?e.reps,
                'plannedWeightKg': ?e.weightKg,
                'plannedTimeSec': ?e.timeSec,
                'plannedRestSec': ?e.restSec,
              },
            ],
          },
        ))
    .toList();

String _iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

const List<String> _ruMonths = <String>[
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/// Открыть форму создания/редактирования занятия. Возвращает true при изменении.
Future<bool> showSessionForm(
  BuildContext context,
  WidgetRef ref, {
  Session? session,
  DateTime? defaultDate,
  TimeOfDay? defaultTime,
  String? defaultClientId,
}) async {
  final bool? changed = await showModalBottomSheet<bool>(
    context: context,
    backgroundColor: context.colors.bg,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _SessionForm(
      session: session,
      defaultDate: defaultDate ?? DateTime.now(),
      defaultTime: defaultTime,
      defaultClientId: defaultClientId,
    ),
  );
  return changed ?? false;
}

class _SessionForm extends ConsumerStatefulWidget {
  const _SessionForm(
      {required this.session, required this.defaultDate, this.defaultTime, this.defaultClientId});
  final Session? session;
  final DateTime defaultDate;
  final TimeOfDay? defaultTime;
  final String? defaultClientId;

  @override
  ConsumerState<_SessionForm> createState() => _SessionFormState();
}

class _SessionFormState extends ConsumerState<_SessionForm> {
  late String? _clientId = widget.session?.clientId ?? widget.defaultClientId;
  late DateTime _date =
      widget.session != null ? calParseIso(widget.session!.date) : widget.defaultDate;
  late TimeOfDay _time = widget.session != null
      ? _parseTime(widget.session!.startTime)
      : (widget.defaultTime ?? _parseTime('12:00'));
  late final TextEditingController _duration =
      TextEditingController(text: '${widget.session?.durationMin ?? 60}');
  late final TextEditingController _title =
      TextEditingController(text: widget.session?.title ?? '');
  late final TextEditingController _location =
      TextEditingController(text: widget.session?.location ?? '');
  late bool _online = widget.session?.isOnline ?? false;
  late SessionStatus _status = widget.session?.status ?? SessionStatus.planned;
  late _WorkoutPick? _workoutPick = widget.session?.workoutId != null
      ? _WorkoutPick.existing(widget.session!.workoutId!, 'Тренировка привязана')
      : null;
  bool _busy = false;

  bool get _isEdit => widget.session != null;

  static TimeOfDay _parseTime(String s) {
    final List<String> p = s.split(':');
    return TimeOfDay(
      hour: int.tryParse(p.isNotEmpty ? p[0] : '') ?? 12,
      minute: p.length > 1 ? int.tryParse(p[1]) ?? 0 : 0,
    );
  }

  String get _timeStr =>
      '${_time.hour.toString().padLeft(2, '0')}:${_time.minute.toString().padLeft(2, '0')}';

  @override
  void dispose() {
    _duration.dispose();
    _title.dispose();
    _location.dispose();
    super.dispose();
  }

  /// Разрешить workoutId: existing → его id; шаблон → создать черновик клиенту
  /// и взять id; нет привязки/нет клиента → null.
  Future<String?> _resolveWorkoutId() async {
    final _WorkoutPick? p = _workoutPick;
    if (p == null) return null;
    if (p.existingId != null) return p.existingId;
    if (p.template != null && _clientId != null) {
      return ref.read(trainerAssignApiProvider)
          .assignReturningId(_clientId!, p.template!.name, _bodyFromTemplate(p.template!));
    }
    return null;
  }

  Future<void> _pickWorkout() async {
    final WorkoutTemplate? picked = await showModalBottomSheet<WorkoutTemplate>(
      context: context,
      backgroundColor: context.colors.bg,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (BuildContext ctx) {
        final AppColors c = ctx.colors;
        // Общие (clientId == null) + персональные клиента занятия; без клиента — только общие.
        final String? cid = _clientId;
        final List<WorkoutTemplate> templates =
            (ref.watch(trainerTemplatesProvider).valueOrNull ?? <WorkoutTemplate>[])
                .where((WorkoutTemplate t) => t.clientId == null || t.clientId == cid)
                .toList();
        return SizedBox(
          height: MediaQuery.of(ctx).size.height * 0.7,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Text('Выбрать тренировку', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: c.ink)),
              ),
              if (templates.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Text('Шаблонов нет. Создайте их в базе знаний.', style: TextStyle(color: c.inkMuted)),
                )
              else
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    itemCount: templates.length,
                    itemBuilder: (BuildContext c2, int i) {
                      final WorkoutTemplate t = templates[i];
                      return GestureDetector(
                        onTap: () => Navigator.pop(ctx, t),
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
                          child: Row(
                            children: <Widget>[
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: <Widget>[
                                    Text(t.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                                    Text('${t.exercises.length} упр.${t.categoryTag != null ? ' · ${t.categoryTag}' : ''}',
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
          ),
        );
      },
    );
    if (picked != null) setState(() => _workoutPick = _WorkoutPick.template(picked));
  }

  Future<void> _save() async {
    final int dur = int.tryParse(_duration.text.trim()) ?? 60;
    setState(() => _busy = true);
    final NavigatorState nav = Navigator.of(context);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      final TrainerCalendarApi api = ref.read(trainerCalendarApiProvider);
      final String? workoutId = await _resolveWorkoutId();
      if (_isEdit) {
        await api.update(
          widget.session!.id,
          clientId: _clientId,
          date: _iso(_date),
          startTime: _timeStr,
          durationMin: dur,
          title: _title.text,
          location: _location.text,
          isOnline: _online,
          status: _status,
          setWorkout: true,
          workoutId: workoutId,
        );
      } else {
        await api.create(
          clientId: _clientId,
          date: _iso(_date),
          startTime: _timeStr,
          durationMin: dur,
          title: _title.text,
          location: _location.text,
          isOnline: _online,
          workoutId: workoutId,
        );
      }
      ref.invalidate(trainerSessionsProvider);
      ref.invalidate(trainerHomeProvider);
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось сохранить занятие')));
    }
  }

  Future<void> _delete() async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Удалить занятие?'),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Удалить')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    final NavigatorState nav = Navigator.of(context);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      await ref.read(trainerCalendarApiProvider).delete(widget.session!.id);
      ref.invalidate(trainerSessionsProvider);
      ref.invalidate(trainerHomeProvider);
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось удалить')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final AsyncValue<List<Client>> clients = ref.watch(trainerClientsProvider);
    final List<Client> active = (clients.valueOrNull ?? <Client>[])
        .where((Client cl) => cl.status == ClientStatus.active)
        .toList();

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(_isEdit ? 'Занятие' : 'Новое занятие',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: c.ink)),
            const SizedBox(height: 16),
            // Клиент.
            DropdownButtonFormField<String?>(
              initialValue: _clientId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Клиент', border: OutlineInputBorder()),
              items: <DropdownMenuItem<String?>>[
                const DropdownMenuItem<String?>(value: null, child: Text('Без клиента')),
                ...active.map((Client cl) => DropdownMenuItem<String?>(
                    value: cl.id, child: Text(cl.fullName, overflow: TextOverflow.ellipsis))),
              ],
              onChanged: (String? v) => setState(() => _clientId = v),
            ),
            const SizedBox(height: 12),
            // Дата + время.
            Row(
              children: <Widget>[
                Expanded(
                  child: _PickerField(
                    label: 'Дата',
                    value: '${_date.day} ${_ruMonths[_date.month - 1]}',
                    onTap: () async {
                      final DateTime? d = await showDatePicker(
                        context: context,
                        initialDate: _date,
                        firstDate: DateTime(_date.year - 1),
                        lastDate: DateTime(_date.year + 2),
                      );
                      if (d != null) setState(() => _date = d);
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _PickerField(
                    label: 'Время',
                    value: _timeStr,
                    onTap: () async {
                      final TimeOfDay? t = await showTimePicker(context: context, initialTime: _time);
                      if (t != null) setState(() => _time = t);
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SelectAllTextField(
              controller: _duration,
              keyboardType: TextInputType.number,
              inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'Длительность, мин', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            SelectAllTextField(
              controller: _title,
              decoration: const InputDecoration(labelText: 'Название (необязательно)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            // Привязка тренировки-плана (шаблон → черновик клиенту при сохранении).
            _PickerField(
              label: 'Тренировка (план)',
              value: _workoutPick?.name ?? 'Не выбрана',
              onTap: _pickWorkout,
            ),
            if (_workoutPick != null)
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: () => setState(() => _workoutPick = null),
                  icon: const Icon(Icons.close, size: 14),
                  label: const Text('Отвязать'),
                ),
              ),
            const SizedBox(height: 12),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Онлайн-занятие'),
              value: _online,
              onChanged: (bool v) => setState(() => _online = v),
            ),
            if (!_online) ...<Widget>[
              const SizedBox(height: 4),
              SelectAllTextField(
                controller: _location,
                decoration: const InputDecoration(labelText: 'Место (необязательно)', border: OutlineInputBorder()),
              ),
              _GymQuickPick(onPick: (String name) => setState(() => _location.text = name)),
            ],
            if (_isEdit) ...<Widget>[
              const SizedBox(height: 16),
              Text('СТАТУС', style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w700)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: <Widget>[
                  _StatusChip(label: 'Запланировано', active: _status == SessionStatus.planned, onTap: () => setState(() => _status = SessionStatus.planned)),
                  _StatusChip(label: 'Проведено', active: _status == SessionStatus.completed, onTap: () => setState(() => _status = SessionStatus.completed)),
                  _StatusChip(label: 'Отменено', active: _status == SessionStatus.cancelled, onTap: () => setState(() => _status = SessionStatus.cancelled)),
                ],
              ),
            ],
            const SizedBox(height: 20),
            Row(
              children: <Widget>[
                if (_isEdit) ...<Widget>[
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy ? null : _delete,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: c.danger,
                        side: BorderSide(color: c.danger.withValues(alpha: 0.5)),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      child: const Text('Удалить'),
                    ),
                  ),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  flex: _isEdit ? 1 : 1,
                  child: FilledButton(
                    onPressed: _busy ? null : _save,
                    style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                    child: _busy
                        ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(_isEdit ? 'Сохранить' : 'Создать'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PickerField extends StatelessWidget {
  const _PickerField({required this.label, required this.value, required this.onTap});
  final String label;
  final String value;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: InputDecorator(
        decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
        child: Text(value),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(color: active ? c.accent : c.chip, borderRadius: BorderRadius.circular(20)),
        child: Text(label,
            style: AppFonts.mono(size: 12, color: active ? c.accentOn : c.inkMuted, weight: FontWeight.w600)),
      ),
    );
  }
}

/// Быстрый выбор зала: чипы из настроенных залов подставляют название в «Место».
class _GymQuickPick extends ConsumerWidget {
  const _GymQuickPick({required this.onPick});
  final ValueChanged<String> onPick;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final List<Gym> gyms = ref.watch(trainerGymsProvider).valueOrNull ?? <Gym>[];
    if (gyms.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: gyms
            .map((Gym g) => GestureDetector(
                  onTap: () => onPick(g.name),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                    decoration: BoxDecoration(color: c.chip, borderRadius: BorderRadius.circular(18)),
                    child: Text(g.name,
                        style: AppFonts.mono(size: 11, color: c.inkMuted, weight: FontWeight.w600)),
                  ),
                ))
            .toList(),
      ),
    );
  }
}
