import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_calendar.dart';
import '../api/trainer_clients.dart';
import '../api/trainer_gyms.dart';

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
}) async {
  final bool? changed = await showModalBottomSheet<bool>(
    context: context,
    backgroundColor: context.colors.bg,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _SessionForm(session: session, defaultDate: defaultDate ?? DateTime.now()),
  );
  return changed ?? false;
}

class _SessionForm extends ConsumerStatefulWidget {
  const _SessionForm({required this.session, required this.defaultDate});
  final Session? session;
  final DateTime defaultDate;

  @override
  ConsumerState<_SessionForm> createState() => _SessionFormState();
}

class _SessionFormState extends ConsumerState<_SessionForm> {
  late String? _clientId = widget.session?.clientId;
  late DateTime _date =
      widget.session != null ? calParseIso(widget.session!.date) : widget.defaultDate;
  late TimeOfDay _time = _parseTime(widget.session?.startTime ?? '12:00');
  late final TextEditingController _duration =
      TextEditingController(text: '${widget.session?.durationMin ?? 60}');
  late final TextEditingController _title =
      TextEditingController(text: widget.session?.title ?? '');
  late final TextEditingController _location =
      TextEditingController(text: widget.session?.location ?? '');
  late bool _online = widget.session?.isOnline ?? false;
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

  Future<void> _save() async {
    final int dur = int.tryParse(_duration.text.trim()) ?? 60;
    setState(() => _busy = true);
    final NavigatorState nav = Navigator.of(context);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      final TrainerCalendarApi api = ref.read(trainerCalendarApiProvider);
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
        );
      }
      ref.invalidate(trainerSessionsProvider);
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
            TextField(
              controller: _duration,
              keyboardType: TextInputType.number,
              inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'Длительность, мин', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _title,
              decoration: const InputDecoration(labelText: 'Название (необязательно)', border: OutlineInputBorder()),
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
              TextField(
                controller: _location,
                decoration: const InputDecoration(labelText: 'Место (необязательно)', border: OutlineInputBorder()),
              ),
              _GymQuickPick(onPick: (String name) => setState(() => _location.text = name)),
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
