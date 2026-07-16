import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../api/trainer_auth.dart';
import '../api/trainer_gyms.dart';

class _ContactType {
  const _ContactType(this.label, this.icon);
  final String label;
  final IconData icon;
}

const List<_ContactType> _contactTypeDefs = <_ContactType>[
  _ContactType('Телефон', Icons.phone_outlined),
  _ContactType('Email', Icons.mail_outline),
  _ContactType('Telegram', Icons.send_outlined),
  _ContactType('WhatsApp', Icons.chat_outlined),
  _ContactType('MAX', Icons.chat_bubble_outline),
  _ContactType('Instagram', Icons.camera_alt_outlined),
  _ContactType('ВКонтакте', Icons.groups_outlined),
];

IconData _iconForType(String type) =>
    _contactTypeDefs.firstWhere((_ContactType t) => t.label == type, orElse: () => _contactTypeDefs.first).icon;

class _EditContact {
  _EditContact({required this.type, required this.value});
  String type;
  final TextEditingController value;
}

/// Редактирование профиля тренера: имя, специализация, дата рождения, био, контакты.
/// Зеркало веб ProfilePage (ProfileEdit). Аватар — P2 (нужен нативный пикер).
class ProfileEditScreen extends ConsumerStatefulWidget {
  const ProfileEditScreen({super.key, required this.profile});
  final TrainerProfile profile;

  @override
  ConsumerState<ProfileEditScreen> createState() => _ProfileEditScreenState();
}

class _ProfileEditScreenState extends ConsumerState<ProfileEditScreen> {
  late final TextEditingController _first;
  late final TextEditingController _last;
  late final TextEditingController _title;
  late final TextEditingController _bio;
  String? _birthIso; // день рождения (день+месяц, год-заглушка), ISO YYYY-MM-DD
  late final TextEditingController _birthYear; // год рождения (опционально, хранится отдельно)
  late final List<_EditContact> _contacts;
  late String? _avatarFileId = widget.profile.avatarFileId;
  bool _busy = false;
  bool _avatarBusy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final TrainerProfile p = widget.profile;
    _first = TextEditingController(text: p.firstName);
    _last = TextEditingController(text: p.lastName);
    _title = TextEditingController(text: p.title ?? '');
    _bio = TextEditingController(text: p.bio ?? '');
    _birthIso = p.birthDate;
    _birthYear = TextEditingController(text: p.birthYear?.toString() ?? '');
    _contacts = p.contacts
        .map((TrainerContact c) => _EditContact(type: c.type, value: TextEditingController(text: c.value)))
        .toList();
  }

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _title.dispose();
    _bio.dispose();
    _birthYear.dispose();
    for (final _EditContact c in _contacts) {
      c.value.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final String first = _first.text.trim();
    final String last = _last.text.trim();
    if (first.isEmpty || last.isEmpty) {
      setState(() => _error = 'Имя и фамилия обязательны');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final NavigatorState nav = Navigator.of(context);
    final List<Map<String, String>> contacts = _contacts
        .where((_EditContact c) => c.value.text.trim().isNotEmpty)
        .map((_EditContact c) => <String, String>{'type': c.type, 'value': c.value.text.trim()})
        .toList();
    // Год рождения: пусто → null; иначе валидный год 1900..текущий, невалид игнорируем.
    final int? parsedYear = int.tryParse(_birthYear.text.trim());
    final int? birthYear =
        (parsedYear != null && parsedYear >= 1900 && parsedYear <= DateTime.now().year) ? parsedYear : null;
    final Map<String, dynamic> body = <String, dynamic>{
      'firstName': first,
      'lastName': last,
      'title': _title.text.trim().isEmpty ? null : _title.text.trim(),
      'bio': _bio.text.trim().isEmpty ? null : _bio.text.trim(),
      'birthDate': _birthIso,
      'birthYear': birthYear,
      'contacts': contacts,
    };
    try {
      await ref.read(trainerApiProvider).updateProfile(body);
      ref.invalidate(trainerMeProvider);
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Не удалось сохранить профиль';
      });
    }
  }

  Future<void> _pickAvatar() async {
    if (_avatarBusy) return;
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    final XFile? picked = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1024, imageQuality: 85);
    if (picked == null) return;
    setState(() => _avatarBusy = true);
    try {
      final TrainerProfile p = await ref.read(trainerApiProvider).uploadAvatar(picked.path, picked.name);
      ref.invalidate(trainerMeProvider);
      if (!mounted) return;
      setState(() {
        _avatarFileId = p.avatarFileId;
        _avatarBusy = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _avatarBusy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось загрузить фото')));
    }
  }

  Future<void> _removeAvatar() async {
    if (_avatarBusy) return;
    setState(() => _avatarBusy = true);
    try {
      await ref.read(trainerApiProvider).removeAvatar();
      ref.invalidate(trainerMeProvider);
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

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final String? token = ref.watch(sessionProvider).token;
    final TrainerApi api = ref.read(trainerApiProvider);
    final String name = '${_first.text} ${_last.text}'.trim();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Редактировать профиль'),
        actions: <Widget>[
          TextButton(onPressed: _busy ? null : _save, child: const Text('Сохранить')),
        ],
      ),
      body: ListView(
        // Низ учитывает резерв под глобальное меню навигации.
        padding: EdgeInsets.fromLTRB(16, 8, 16, MediaQuery.of(context).padding.bottom + 24),
        children: <Widget>[
          Center(
            child: Column(
              children: <Widget>[
                Stack(
                  alignment: Alignment.bottomRight,
                  children: <Widget>[
                    AuthedAvatar(
                      url: _avatarFileId != null ? api.fileUrl(_avatarFileId!) : null,
                      token: token,
                      initials: name.isEmpty ? '' : name.substring(0, 1).toUpperCase(),
                      radius: 44,
                    ),
                    Positioned(
                      right: -2,
                      bottom: -2,
                      child: GestureDetector(
                        onTap: _avatarBusy ? null : _pickAvatar,
                        child: Container(
                          padding: const EdgeInsets.all(7),
                          decoration: BoxDecoration(color: c.accent, shape: BoxShape.circle, border: Border.all(color: c.bg, width: 2)),
                          child: _avatarBusy
                              ? SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: c.accentOn))
                              : Icon(Icons.photo_camera, size: 16, color: c.accentOn),
                        ),
                      ),
                    ),
                  ],
                ),
                if (_avatarFileId != null)
                  TextButton(
                    onPressed: _avatarBusy
                        ? null
                        : () async {
                            if (await confirmDelete(context, title: 'Удалить фото?')) _removeAvatar();
                          },
                    child: Text('Удалить фото', style: TextStyle(color: c.inkMuted, fontSize: 13)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(_error!, style: TextStyle(color: c.danger, fontSize: 13)),
            ),
          Row(
            children: <Widget>[
              Expanded(child: _field(c, 'Имя', _first)),
              const SizedBox(width: 10),
              Expanded(child: _field(c, 'Фамилия', _last)),
            ],
          ),
          const SizedBox(height: 14),
          _field(c, 'Специализация', _title, hint: 'Силовой тренинг, реабилитация…'),
          const SizedBox(height: 14),
          _Label('Дата рождения'),
          GestureDetector(
            onTap: () async {
              final ({int day, int month})? cur = dayMonthFromIso(_birthIso);
              final ({int day, int month})? r =
                  await pickDayMonth(context, day: cur?.day, month: cur?.month);
              if (r != null) setState(() => _birthIso = dayMonthToIso(r.day, r.month));
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
              child: Row(
                children: <Widget>[
                  Icon(Icons.cake_outlined, size: 18, color: c.inkMuted),
                  const SizedBox(width: 10),
                  Text(
                    formatDayMonth(_birthIso).isEmpty ? 'Не указан' : formatDayMonth(_birthIso),
                    style: TextStyle(fontSize: 14, color: _birthIso != null ? c.ink : c.inkMuted),
                  ),
                  const Spacer(),
                  if (_birthIso != null)
                    GestureDetector(
                      onTap: () => setState(() => _birthIso = null),
                      child: Icon(Icons.close, size: 18, color: c.inkMuted),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          _Label('Год рождения'),
          SelectAllTextField(
            controller: _birthYear,
            keyboardType: TextInputType.number,
            inputFormatters: <TextInputFormatter>[
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(4),
            ],
            decoration: InputDecoration(
              hintText: 'Например, 1990 (необязательно)',
              filled: true,
              fillColor: c.card,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 14),
          _Label('О себе'),
          TextField(
            controller: _bio,
            maxLines: 4,
            maxLength: 2000,
            decoration: InputDecoration(
              counterText: '',
              hintText: 'Опыт, подход, для кого подходят тренировки',
              filled: true,
              fillColor: c.card,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 16),
          // ── Связь (типизированные контакты) ──
          _Label('Связь'),
          ..._contacts.asMap().entries.map((MapEntry<int, _EditContact> e) => _contactRow(c, e.key, e.value)),
          ..._contactTypeDefs.map((_ContactType t) => Padding(
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
          const SizedBox(height: 16),
          // ── Залы ──
          const _GymsEditSection(),
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
            child: SelectAllTextField(
              controller: ct.value,
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

  Widget _field(AppColors c, String label, TextEditingController ctrl, {String? hint}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _Label(label),
        SelectAllTextField(
          controller: ctrl,
          decoration: InputDecoration(
            hintText: hint,
            filled: true,
            fillColor: c.card,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
          ),
        ),
      ],
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
            style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.5, color: context.colors.inkMutedXl)),
      );
}

/// Управление залами в профиле тренера: список + добавление/удаление.
class _GymsEditSection extends ConsumerStatefulWidget {
  const _GymsEditSection();
  @override
  ConsumerState<_GymsEditSection> createState() => _GymsEditSectionState();
}

class _GymsEditSectionState extends ConsumerState<_GymsEditSection> {
  final TextEditingController _name = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final String name = _name.text.trim();
    if (name.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      await ref.read(trainerGymsApiProvider).create(name: name);
      ref.invalidate(trainerGymsProvider);
      if (!mounted) return;
      setState(() {
        _name.clear();
        _busy = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
    }
  }

  Future<void> _delete(String id) async {
    try {
      await ref.read(trainerGymsApiProvider).delete(id);
      ref.invalidate(trainerGymsProvider);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final List<Gym> gyms = ref.watch(trainerGymsProvider).valueOrNull ?? <Gym>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        const _Label('Залы'),
        ...gyms.map((Gym g) => Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
              child: Row(
                children: <Widget>[
                  Icon(Icons.fitness_center, size: 18, color: c.inkMuted),
                  const SizedBox(width: 12),
                  Expanded(child: Text(g.name, style: TextStyle(fontSize: 15, color: c.ink))),
                  GestureDetector(
                    onTap: () async {
                      if (await confirmDelete(context, title: 'Удалить зал?')) _delete(g.id);
                    },
                    child: Icon(Icons.delete_outline, size: 18, color: c.inkMuted),
                  ),
                ],
              ),
            )),
        Row(
          children: <Widget>[
            Expanded(
              child: SelectAllTextField(
                controller: _name,
                onSubmitted: (_) => _add(),
                decoration: InputDecoration(
                  hintText: 'добавить зал',
                  isDense: true,
                  filled: true,
                  fillColor: c.card,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                ),
              ),
            ),
            const SizedBox(width: 8),
            FilledButton(onPressed: _busy ? null : _add, child: const Text('Добавить')),
          ],
        ),
      ],
    );
  }
}
