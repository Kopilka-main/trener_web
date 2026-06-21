import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_clients.dart';

/// Создание (client == null) или редактирование клиента: имя, телефон, формат,
/// статус (при правке), заметки; код подключения (при создании).
class ClientEditScreen extends ConsumerStatefulWidget {
  const ClientEditScreen({super.key, this.client});
  final Client? client;

  @override
  ConsumerState<ClientEditScreen> createState() => _ClientEditScreenState();
}

class _ClientEditScreenState extends ConsumerState<ClientEditScreen> {
  late final TextEditingController _first =
      TextEditingController(text: widget.client?.firstName ?? '');
  late final TextEditingController _last =
      TextEditingController(text: widget.client?.lastName ?? '');
  late final TextEditingController _phone =
      TextEditingController(text: widget.client?.phone ?? '');
  late final TextEditingController _notes =
      TextEditingController(text: widget.client?.notes ?? '');
  final TextEditingController _code = TextEditingController();
  late bool _online = widget.client?.isOnline ?? false;
  late ClientStatus _status = widget.client?.status ?? ClientStatus.active;
  bool _busy = false;

  bool get _isEdit => widget.client != null;

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _phone.dispose();
    _notes.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_first.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Укажите имя')));
      return;
    }
    setState(() => _busy = true);
    final NavigatorState nav = Navigator.of(context);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      final TrainerClientsApi api = ref.read(trainerClientsApiProvider);
      if (_isEdit) {
        await api.update(
          widget.client!.id,
          firstName: _first.text.trim(),
          lastName: _last.text.trim(),
          phone: _phone.text,
          isOnline: _online,
          status: _status,
          notes: _notes.text,
        );
      } else {
        await api.create(
          firstName: _first.text.trim(),
          lastName: _last.text.trim(),
          phone: _phone.text,
          isOnline: _online,
          accountId: _code.text,
        );
      }
      ref.invalidate(trainerClientsProvider);
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось сохранить')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_isEdit ? 'Редактировать клиента' : 'Новый клиент')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          TextField(
            controller: _first,
            decoration: const InputDecoration(labelText: 'Имя', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _last,
            decoration: const InputDecoration(labelText: 'Фамилия', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Телефон', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Онлайн-формат'),
            value: _online,
            onChanged: (bool v) => setState(() => _online = v),
          ),
          if (_isEdit) ...<Widget>[
            const SizedBox(height: 4),
            const Text('Статус'),
            const SizedBox(height: 6),
            SegmentedButton<ClientStatus>(
              segments: const <ButtonSegment<ClientStatus>>[
                ButtonSegment<ClientStatus>(value: ClientStatus.active, label: Text('Активный')),
                ButtonSegment<ClientStatus>(value: ClientStatus.archived, label: Text('В архиве')),
              ],
              selected: <ClientStatus>{_status},
              onSelectionChanged: (Set<ClientStatus> s) => setState(() => _status = s.first),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _notes,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'Заметки', border: OutlineInputBorder(), alignLabelWithHint: true),
            ),
          ] else ...<Widget>[
            const SizedBox(height: 12),
            TextField(
              controller: _code,
              decoration: const InputDecoration(
                labelText: 'Код подключения (необязательно)',
                helperText: 'Привязать аккаунт клиента по его коду',
                border: OutlineInputBorder(),
              ),
            ),
          ],
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _busy ? null : _save,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
            child: _busy
                ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(_isEdit ? 'Сохранить' : 'Создать'),
          ),
        ],
      ),
    );
  }
}
