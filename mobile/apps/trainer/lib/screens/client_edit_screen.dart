import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../api/trainer_clients.dart';

/// Типы контактов и их оформление (зеркало веб CONTACT_ADD).
class _ContactType {
  const _ContactType(this.label, this.icon, this.keyboard);
  final String label;
  final IconData icon;
  final TextInputType keyboard;
}

const List<_ContactType> _contactTypes = <_ContactType>[
  _ContactType('Телефон', Icons.phone_outlined, TextInputType.phone),
  _ContactType('Email', Icons.mail_outline, TextInputType.emailAddress),
  _ContactType('Telegram', Icons.send_outlined, TextInputType.text),
  _ContactType('WhatsApp', Icons.chat_outlined, TextInputType.phone),
  _ContactType('MAX', Icons.chat_bubble_outline, TextInputType.text),
  _ContactType('Instagram', Icons.camera_alt_outlined, TextInputType.text),
  _ContactType('ВКонтакте', Icons.groups_outlined, TextInputType.text),
];

IconData _iconForType(String type) =>
    _contactTypes.firstWhere((_ContactType t) => t.label == type, orElse: () => _contactTypes.first).icon;

class _EditContact {
  _EditContact({required this.type, required this.value});
  final String type;
  final TextEditingController value;
}

/// Создание/правка клиента тренером. Зеркало веб ClientEditPage: X/✓-шапка,
/// аватар, подключение по коду, формат, типизированные контакты, ДР, заметки,
/// теги, удаление.
class ClientEditScreen extends ConsumerStatefulWidget {
  const ClientEditScreen({super.key, this.client});
  final Client? client;

  @override
  ConsumerState<ClientEditScreen> createState() => _ClientEditScreenState();
}

class _ClientEditScreenState extends ConsumerState<ClientEditScreen> {
  late final TextEditingController _first = TextEditingController(text: widget.client?.firstName ?? '');
  late final TextEditingController _last = TextEditingController(text: widget.client?.lastName ?? '');
  late final TextEditingController _notes = TextEditingController(text: widget.client?.notes ?? '');
  late bool _online = widget.client?.isOnline ?? false;
  late final ClientStatus _status = widget.client?.status ?? ClientStatus.active;
  late DateTime? _birth = (widget.client?.birthDate != null && widget.client!.birthDate!.length >= 10)
      ? DateTime.tryParse(widget.client!.birthDate!.substring(0, 10))
      : null;
  late String? _accountId = widget.client?.accountId;
  late String? _avatarFileId = widget.client?.avatarFileId;
  late final List<_EditContact> _contacts = _initContacts();
  late final List<String> _tags = <String>[...?widget.client?.tags];
  final TextEditingController _tagInput = TextEditingController();
  bool _busy = false;
  bool _avatarBusy = false;

  bool get _isEdit => widget.client != null;

  List<_EditContact> _initContacts() {
    final List<ClientContact> src = widget.client?.contacts ?? <ClientContact>[];
    final List<_EditContact> list = src
        .map((ClientContact c) => _EditContact(type: c.type, value: TextEditingController(text: c.value)))
        .toList();
    // Если контактов нет, но есть телефон — подставляем как контакт «Телефон».
    if (list.isEmpty && widget.client?.phone?.trim().isNotEmpty == true) {
      list.add(_EditContact(type: 'Телефон', value: TextEditingController(text: widget.client!.phone!.trim())));
    }
    return list;
  }

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _notes.dispose();
    _tagInput.dispose();
    for (final _EditContact c in _contacts) {
      c.value.dispose();
    }
    super.dispose();
  }

  String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _save() async {
    if (_first.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Укажите имя')));
      return;
    }
    setState(() => _busy = true);
    final NavigatorState nav = Navigator.of(context);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    final List<Map<String, String>> contacts = _contacts
        .where((_EditContact c) => c.value.text.trim().isNotEmpty)
        .map((_EditContact c) => <String, String>{'type': c.type, 'value': c.value.text.trim()})
        .toList();
    final String? phone = contacts.cast<Map<String, String>?>().firstWhere(
          (Map<String, String>? c) => c?['type'] == 'Телефон',
          orElse: () => null,
        )?['value'];
    try {
      final TrainerClientsApi api = ref.read(trainerClientsApiProvider);
      if (_isEdit) {
        await api.update(
          widget.client!.id,
          firstName: _first.text.trim(),
          lastName: _last.text.trim(),
          phone: phone,
          isOnline: _online,
          status: _status,
          notes: _notes.text,
          setBirthDate: true,
          birthDate: _birth != null ? _iso(_birth!) : null,
          setAccountId: true,
          accountId: _accountId,
          contacts: contacts,
          tags: _tags,
        );
      } else {
        await api.create(
          firstName: _first.text.trim(),
          lastName: _last.text.trim(),
          phone: phone,
          isOnline: _online,
          accountId: _accountId,
          birthDate: _birth != null ? _iso(_birth!) : null,
          contacts: contacts,
          tags: _tags,
        );
      }
      ref.invalidate(trainerClientsProvider);
      if (_isEdit) ref.invalidate(trainerClientProvider(widget.client!.id));
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось сохранить')));
    }
  }

  Future<void> _pickAvatar() async {
    if (!_isEdit || _avatarBusy) return;
    final XFile? picked = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1024, imageQuality: 85);
    if (picked == null) return;
    setState(() => _avatarBusy = true);
    try {
      await ref.read(trainerClientsApiProvider).uploadAvatar(widget.client!.id, picked.path, picked.name);
      ref.invalidate(trainerClientProvider(widget.client!.id));
      final Client fresh = await ref.read(trainerClientsApiProvider).byId(widget.client!.id);
      if (!mounted) return;
      setState(() {
        _avatarFileId = fresh.avatarFileId;
        _avatarBusy = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _avatarBusy = false);
    }
  }

  Future<void> _removeAvatar() async {
    if (!_isEdit || _avatarBusy) return;
    setState(() => _avatarBusy = true);
    try {
      await ref.read(trainerClientsApiProvider).removeAvatar(widget.client!.id);
      ref.invalidate(trainerClientProvider(widget.client!.id));
      if (!mounted) return;
      setState(() {
        _avatarFileId = null;
        _avatarBusy = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _avatarBusy = false);
    }
  }

  Future<void> _openConnect() async {
    final String? code = await _showConnectDialog(context, excludeClientId: widget.client?.id);
    if (code == null || code.trim().isEmpty) return;
    setState(() => _accountId = code.trim());
  }

  Future<void> _fillFromAccount() async {
    if (_accountId == null) return;
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      final Map<String, dynamic> p = await ref.read(trainerClientsApiProvider).accountProfile(_accountId!);
      if (!mounted) return;
      setState(() {
        if ((p['firstName'] as String?)?.isNotEmpty == true) _first.text = p['firstName'] as String;
        if ((p['lastName'] as String?)?.isNotEmpty == true) _last.text = p['lastName'] as String;
        final String? bd = p['birthDate'] as String?;
        if (bd != null && bd.length >= 10) _birth = DateTime.tryParse(bd.substring(0, 10));
        // Дописываем недостающие контакты (без дублей по type+value).
        final List<dynamic> cs = (p['contacts'] as List<dynamic>?) ?? <dynamic>[];
        for (final dynamic raw in cs) {
          final Map<String, dynamic> ct = raw as Map<String, dynamic>;
          final String type = ct['type'] as String? ?? '';
          final String value = ct['value'] as String? ?? '';
          if (value.trim().isEmpty) continue;
          final bool exists = _contacts.any((_EditContact e) => e.type == type && e.value.text.trim() == value.trim());
          if (!exists) _contacts.add(_EditContact(type: type, value: TextEditingController(text: value)));
        }
      });
      m.showSnackBar(const SnackBar(content: Text('Данные подставлены')));
    } catch (_) {
      m.showSnackBar(const SnackBar(content: Text('Не удалось получить данные')));
    }
  }

  Future<void> _delete() async {
    final NavigatorState nav = Navigator.of(context);
    final bool ok = await _showDeleteDialog(context, widget.client!.fullName);
    if (!ok) return;
    setState(() => _busy = true);
    try {
      await ref.read(trainerClientsApiProvider).delete(widget.client!.id);
      ref.invalidate(trainerClientsProvider);
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
    }
  }

  void _addTag() {
    final String t = _tagInput.text.trim();
    if (t.isEmpty || _tags.contains(t)) {
      _tagInput.clear();
      return;
    }
    setState(() {
      _tags.add(t);
      _tagInput.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(
        leading: IconButton(
          icon: CircleAvatar(backgroundColor: c.card, child: Icon(Icons.close, size: 20, color: c.ink)),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(_isEdit ? 'Клиент' : 'Новый клиент'),
        actions: <Widget>[
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: GestureDetector(
              onTap: _busy ? null : _save,
              child: CircleAvatar(
                backgroundColor: c.accent,
                child: _busy
                    ? SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: c.accentOn))
                    : Icon(Icons.check, color: c.accentOn),
              ),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: <Widget>[
          // Аватар.
          Center(
            child: Column(
              children: <Widget>[
                Stack(
                  alignment: Alignment.bottomRight,
                  children: <Widget>[
                    AuthedAvatar(
                      url: (_isEdit && _avatarFileId != null)
                          ? '${ref.read(baseUrlProvider).replaceAll(RegExp(r'/$'), '')}/api/files/$_avatarFileId'
                          : null,
                      token: ref.watch(sessionProvider).token,
                      initials: '${_first.text.isNotEmpty ? _first.text[0] : ''}${_last.text.isNotEmpty ? _last.text[0] : ''}'.toUpperCase(),
                      radius: 44,
                    ),
                    if (_isEdit)
                      GestureDetector(
                        onTap: _avatarBusy ? null : _pickAvatar,
                        child: Container(
                          padding: const EdgeInsets.all(7),
                          decoration: BoxDecoration(color: c.accent, shape: BoxShape.circle, border: Border.all(color: c.bg, width: 2)),
                          child: _avatarBusy
                              ? SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: c.accentOn))
                              : Icon(Icons.photo_camera, size: 14, color: c.accentOn),
                        ),
                      ),
                  ],
                ),
                if (_isEdit) ...<Widget>[
                  const SizedBox(height: 4),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: <Widget>[
                      TextButton(onPressed: _avatarBusy ? null : _pickAvatar, child: const Text('Изменить фото')),
                      if (_avatarFileId != null)
                        TextButton(
                            onPressed: _avatarBusy ? null : _removeAvatar,
                            child: Text('Удалить', style: TextStyle(color: c.inkMuted))),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 8),
          // ── Подключение ──
          _Label('Подключение'),
          GestureDetector(
            onTap: _openConnect,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
              child: Row(
                children: <Widget>[
                  Icon(_accountId != null ? Icons.link : Icons.add_link, size: 22, color: c.inkMuted),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(_accountId != null ? 'Код привязки указан' : 'Подключить клиента',
                            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                        Text(_accountId != null ? 'ID: $_accountId' : 'Привязать по коду из приложения клиента',
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 12, color: c.inkMuted)),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right, size: 18, color: c.inkMutedXl),
                ],
              ),
            ),
          ),
          if (_accountId != null) ...<Widget>[
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _fillFromAccount,
              icon: const Icon(Icons.download_outlined, size: 18),
              label: const Text('Получить данные из профиля клиента'),
            ),
          ],
          const SizedBox(height: 16),
          // ── Имя/Фамилия ──
          _field(c, 'Имя', _first, onChanged: (_) => setState(() {})),
          const SizedBox(height: 10),
          _field(c, 'Фамилия', _last, onChanged: (_) => setState(() {})),
          const SizedBox(height: 16),
          // ── Формат ──
          _Label('Формат'),
          Row(
            children: <Widget>[
              _SegBtn(label: 'Спортзал', active: !_online, onTap: () => setState(() => _online = false)),
              const SizedBox(width: 8),
              _SegBtn(label: 'Онлайн', active: _online, onTap: () => setState(() => _online = true)),
            ],
          ),
          const SizedBox(height: 16),
          // ── Связь ──
          _Label('Связь'),
          ..._contacts.asMap().entries.map((MapEntry<int, _EditContact> e) => _contactRow(c, e.key, e.value)),
          ..._contactTypes.map((_ContactType t) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: GestureDetector(
                  onTap: () => setState(() => _contacts.add(_EditContact(type: t.label, value: TextEditingController()))),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
                    child: Row(
                      children: <Widget>[
                        CircleAvatar(radius: 16, backgroundColor: c.accent, child: Icon(Icons.add, size: 18, color: c.accentOn)),
                        const SizedBox(width: 12),
                        Text('добавить ${t.label}', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                      ],
                    ),
                  ),
                ),
              )),
          const SizedBox(height: 8),
          // ── Личное ──
          _Label('Личное'),
          InkWell(
            onTap: () async {
              final DateTime now = DateTime.now();
              final DateTime? d = await showDatePicker(
                context: context, initialDate: _birth ?? DateTime(now.year - 25), firstDate: DateTime(1900), lastDate: now);
              if (d != null) setState(() => _birth = d);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
              child: Row(
                children: <Widget>[
                  Icon(Icons.cake_outlined, size: 18, color: c.inkMuted),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text('Дата рождения', style: TextStyle(fontSize: 12, color: c.inkMuted)),
                        Text(
                            _birth != null
                                ? '${_birth!.day.toString().padLeft(2, '0')}.${_birth!.month.toString().padLeft(2, '0')}.${_birth!.year}'
                                : 'Не указана',
                            style: TextStyle(fontSize: 15, color: _birth != null ? c.ink : c.inkMuted)),
                      ],
                    ),
                  ),
                  if (_birth != null)
                    GestureDetector(onTap: () => setState(() => _birth = null), child: Icon(Icons.close, size: 18, color: c.inkMuted)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          // ── Заметки ──
          _Label('Заметки'),
          TextField(
            controller: _notes,
            maxLines: 4,
            decoration: InputDecoration(
              hintText: 'Заметка о клиенте…',
              filled: true,
              fillColor: c.card,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 16),
          // ── Теги ──
          _Label('Теги'),
          if (_tags.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _tags
                    .map((String t) => Chip(
                          label: Text('#$t'),
                          onDeleted: () => setState(() => _tags.remove(t)),
                          visualDensity: VisualDensity.compact,
                        ))
                    .toList(),
              ),
            ),
          TextField(
            controller: _tagInput,
            onSubmitted: (_) => _addTag(),
            decoration: InputDecoration(
              hintText: '+ добавить',
              filled: true,
              fillColor: c.card,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('Введите тег и нажмите ввод. Теги помогают быстро группировать клиентов.',
                style: TextStyle(fontSize: 12, color: c.inkMuted)),
          ),
          if (_isEdit) ...<Widget>[
            const SizedBox(height: 20),
            OutlinedButton.icon(
              onPressed: _busy ? null : _delete,
              icon: Icon(Icons.delete_outline, size: 18, color: c.danger),
              label: Text('Удалить клиента', style: TextStyle(color: c.danger)),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48), side: BorderSide(color: c.line)),
            ),
          ],
        ],
      ),
    );
  }

  Widget _contactRow(AppColors c, int i, _EditContact ct) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 6, 8, 6),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
      child: Row(
        children: <Widget>[
          Icon(_iconForType(ct.type), size: 18, color: c.inkMuted),
          const SizedBox(width: 10),
          SizedBox(width: 76, child: Text(ct.type, style: TextStyle(fontSize: 13, color: c.inkMuted))),
          Expanded(
            child: TextField(
              controller: ct.value,
              keyboardType: _contactTypes
                  .firstWhere((_ContactType t) => t.label == ct.type, orElse: () => _contactTypes.first)
                  .keyboard,
              decoration: const InputDecoration(isDense: true, border: InputBorder.none, hintText: 'значение'),
            ),
          ),
          GestureDetector(
            onTap: () => setState(() {
              _contacts.removeAt(i).value.dispose();
            }),
            child: Padding(padding: const EdgeInsets.all(6), child: Icon(Icons.close, size: 18, color: c.inkMuted)),
          ),
        ],
      ),
    );
  }

  Widget _field(AppColors c, String label, TextEditingController ctrl, {ValueChanged<String>? onChanged}) {
    return TextField(
      controller: ctrl,
      onChanged: onChanged,
      decoration: InputDecoration(
        labelText: label,
        filled: true,
        fillColor: c.card,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text.toUpperCase(),
            style: AppFonts.mono(size: 11, color: context.colors.inkMutedXl, weight: FontWeight.w700)),
      );
}

class _SegBtn extends StatelessWidget {
  const _SegBtn({required this.label, required this.active, required this.onTap});
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
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: active ? c.accent : c.card,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Text(label,
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: active ? c.accentOn : c.inkMuted)),
        ),
      ),
    );
  }
}

/// Диалог подключения: ввод кода + проверка перед применением.
Future<String?> _showConnectDialog(BuildContext context, {String? excludeClientId}) {
  final TextEditingController code = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (BuildContext ctx) {
      String? error;
      bool checking = false;
      return StatefulBuilder(
        builder: (BuildContext ctx, void Function(void Function()) setLocal) => AlertDialog(
          title: const Text('Подключить клиента'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              TextField(
                controller: code,
                autofocus: true,
                decoration: const InputDecoration(labelText: 'Код из приложения клиента', border: OutlineInputBorder()),
              ),
              if (error != null) ...<Widget>[
                const SizedBox(height: 8),
                Text(error!, style: TextStyle(color: ctx.colors.danger, fontSize: 13)),
              ],
            ],
          ),
          actions: <Widget>[
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Отмена')),
            Consumer(
              builder: (BuildContext ctx, WidgetRef ref, _) => FilledButton(
                onPressed: checking
                    ? null
                    : () async {
                        final String v = code.text.trim();
                        if (v.isEmpty) return;
                        setLocal(() {
                          checking = true;
                          error = null;
                        });
                        try {
                          final ({bool exists, String? linkedClientName}) res =
                              await ref.read(trainerClientsApiProvider).checkConnectCode(v, excludeClientId: excludeClientId);
                          if (!res.exists) {
                            setLocal(() {
                              error = 'Клиент с таким кодом не найден';
                              checking = false;
                            });
                            return;
                          }
                          if (res.linkedClientName != null) {
                            setLocal(() {
                              error = 'Код уже привязан: ${res.linkedClientName}';
                              checking = false;
                            });
                            return;
                          }
                          if (ctx.mounted) Navigator.pop(ctx, v);
                        } catch (_) {
                          setLocal(() {
                            error = 'Не удалось проверить код';
                            checking = false;
                          });
                        }
                      },
                child: checking
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Проверить'),
              ),
            ),
          ],
        ),
      );
    },
  );
}

/// Диалог удаления: требует ввести имя клиента точно.
Future<bool> _showDeleteDialog(BuildContext context, String name) async {
  final TextEditingController input = TextEditingController();
  final bool? ok = await showDialog<bool>(
    context: context,
    builder: (BuildContext ctx) {
      bool match = false;
      return StatefulBuilder(
        builder: (BuildContext ctx, void Function(void Function()) setLocal) => AlertDialog(
          title: const Text('Удалить клиента?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text('Действие необратимо. Введите «$name» для подтверждения.', style: const TextStyle(fontSize: 14)),
              const SizedBox(height: 12),
              TextField(
                controller: input,
                autofocus: true,
                onChanged: (String v) => setLocal(() => match = v.trim() == name.trim()),
                decoration: const InputDecoration(border: OutlineInputBorder()),
              ),
            ],
          ),
          actions: <Widget>[
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
            FilledButton(
              onPressed: match ? () => Navigator.pop(ctx, true) : null,
              style: FilledButton.styleFrom(backgroundColor: ctx.colors.danger),
              child: const Text('Удалить'),
            ),
          ],
        ),
      );
    },
  );
  return ok ?? false;
}
