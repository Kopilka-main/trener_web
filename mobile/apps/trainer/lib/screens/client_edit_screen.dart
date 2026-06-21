import 'package:core/core.dart';
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
  late DateTime? _birth = (widget.client?.birthDate != null && widget.client!.birthDate!.length >= 10)
      ? DateTime.tryParse(widget.client!.birthDate!.substring(0, 10))
      : null;
  bool _busy = false;

  bool get _isEdit => widget.client != null;

  String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _phone.dispose();
    _notes.dispose();
    _code.dispose();
    super.dispose();
  }

  String? _codeMsg; // результат проверки кода
  bool _codeOk = false;
  bool _checking = false;

  /// Серверная проверка кода до сохранения: существует ли аккаунт и не занят ли.
  Future<void> _checkCode() async {
    final String code = _code.text.trim();
    if (code.isEmpty || _checking) return;
    setState(() {
      _checking = true;
      _codeMsg = null;
      _codeOk = false;
    });
    try {
      final ({bool exists, String? linkedClientName}) r = await ref
          .read(trainerClientsApiProvider)
          .checkConnectCode(code, excludeClientId: widget.client?.id);
      if (!mounted) return;
      setState(() {
        _checking = false;
        if (!r.exists) {
          _codeMsg = 'Клиент с таким кодом не найден';
          _codeOk = false;
        } else if (r.linkedClientName != null && r.linkedClientName!.isNotEmpty) {
          _codeMsg = 'Код уже привязан к клиенту: ${r.linkedClientName}';
          _codeOk = false;
        } else {
          _codeMsg = 'Код найден — можно привязать';
          _codeOk = true;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _checking = false;
        _codeMsg = 'Не удалось проверить код';
        _codeOk = false;
      });
    }
  }

  /// Дозаполнить имя/фамилию/ДР из профиля привязанного аккаунта.
  Future<void> _fillFromAccount() async {
    final String code = _code.text.trim();
    if (code.isEmpty) return;
    try {
      final Map<String, dynamic> p = await ref.read(trainerClientsApiProvider).accountProfile(code);
      if (!mounted) return;
      setState(() {
        if ((p['firstName'] as String?)?.isNotEmpty == true) _first.text = p['firstName'] as String;
        if ((p['lastName'] as String?)?.isNotEmpty == true) _last.text = p['lastName'] as String;
        final String? bd = p['birthDate'] as String?;
        if (bd != null && bd.length >= 10) _birth = DateTime.tryParse(bd.substring(0, 10));
      });
    } catch (_) {}
  }

  Future<void> _save() async {
    if (_first.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Укажите имя')));
      return;
    }
    final String code = _code.text.trim();
    // Если ввели код, но не проверили или он невалиден — не даём сохранить с битой привязкой.
    if (code.isNotEmpty && !_codeOk) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Проверьте код подключения перед сохранением')));
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
          setBirthDate: true,
          birthDate: _birth != null ? _iso(_birth!) : null,
          // Привязываем только если ввели проверенный код (иначе не трогаем связь).
          setAccountId: code.isNotEmpty && _codeOk,
          accountId: code,
        );
      } else {
        await api.create(
          firstName: _first.text.trim(),
          lastName: _last.text.trim(),
          phone: _phone.text,
          isOnline: _online,
          accountId: code,
          birthDate: _birth != null ? _iso(_birth!) : null,
        );
      }
      ref.invalidate(trainerClientsProvider);
      if (!mounted) return;
      nav.pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      final String? msg = apiErrorMessage(e);
      m.showSnackBar(SnackBar(
          content: Text(msg != null && msg.toLowerCase().contains('код')
              ? 'Неверный код подключения'
              : (msg ?? 'Не удалось сохранить'))));
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
          InkWell(
            onTap: () async {
              final DateTime now = DateTime.now();
              final DateTime? d = await showDatePicker(
                context: context,
                initialDate: _birth ?? DateTime(now.year - 25),
                firstDate: DateTime(1900),
                lastDate: now,
              );
              if (d != null) setState(() => _birth = d);
            },
            child: InputDecorator(
              decoration: InputDecoration(
                labelText: 'Дата рождения (необязательно)',
                border: const OutlineInputBorder(),
                suffixIcon: _birth != null
                    ? IconButton(icon: const Icon(Icons.close, size: 18), onPressed: () => setState(() => _birth = null))
                    : const Icon(Icons.event),
              ),
              child: Text(_birth != null
                  ? '${_birth!.day.toString().padLeft(2, '0')}.${_birth!.month.toString().padLeft(2, '0')}.${_birth!.year}'
                  : 'Не указана'),
            ),
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
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _notes,
            maxLines: 4,
            decoration: const InputDecoration(labelText: 'Заметки', border: OutlineInputBorder(), alignLabelWithHint: true),
          ),
          const SizedBox(height: 16),
          // ── Подключение аккаунта клиента (проверка кода до сохранения) ──
          Text('ПОДКЛЮЧЕНИЕ', style: AppFonts.mono(size: 11, color: context.colors.inkMutedXl, weight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (_isEdit && widget.client!.hasAccount)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text('Аккаунт уже привязан. Новый код заменит привязку.',
                  style: TextStyle(fontSize: 12, color: context.colors.inkMuted)),
            ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Expanded(
                child: TextField(
                  controller: _code,
                  onChanged: (_) => setState(() { _codeMsg = null; _codeOk = false; }),
                  decoration: const InputDecoration(
                    labelText: 'Код из приложения клиента',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                height: 56,
                child: FilledButton.tonal(
                  onPressed: _checking ? null : _checkCode,
                  child: _checking
                      ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Проверить'),
                ),
              ),
            ],
          ),
          if (_codeMsg != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                children: <Widget>[
                  Icon(_codeOk ? Icons.check_circle_outline : Icons.error_outline,
                      size: 16, color: _codeOk ? context.colors.accent : context.colors.danger),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(_codeMsg!,
                        style: TextStyle(fontSize: 13, color: _codeOk ? context.colors.ink : context.colors.danger)),
                  ),
                ],
              ),
            ),
          if (_codeOk)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _fillFromAccount,
                icon: const Icon(Icons.download, size: 16),
                label: const Text('Получить данные из профиля'),
              ),
            ),
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
