import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../api/trainer_auth.dart';

const List<String> _contactTypes = <String>['Телефон', 'WhatsApp', 'Telegram', 'MAX', 'Instagram', 'Прочее'];

String _iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

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
  DateTime? _birth;
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
    _birth = p.birthDate != null ? DateTime.tryParse(p.birthDate!) : null;
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
    final Map<String, dynamic> body = <String, dynamic>{
      'firstName': first,
      'lastName': last,
      'title': _title.text.trim().isEmpty ? null : _title.text.trim(),
      'bio': _bio.text.trim().isEmpty ? null : _bio.text.trim(),
      'birthDate': _birth != null ? _iso(_birth!) : null,
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
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
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
                    onPressed: _avatarBusy ? null : _removeAvatar,
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
              final DateTime now = DateTime.now();
              final DateTime? d = await showDatePicker(
                context: context,
                initialDate: _birth ?? DateTime(now.year - 25),
                firstDate: DateTime(1900),
                lastDate: now,
              );
              if (d != null) setState(() => _birth = d);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
              child: Row(
                children: <Widget>[
                  Icon(Icons.event, size: 18, color: c.inkMuted),
                  const SizedBox(width: 10),
                  Text(
                    _birth != null
                        ? '${_birth!.day.toString().padLeft(2, '0')}.${_birth!.month.toString().padLeft(2, '0')}.${_birth!.year}'
                        : 'Не указана',
                    style: TextStyle(fontSize: 14, color: _birth != null ? c.ink : c.inkMuted),
                  ),
                  const Spacer(),
                  if (_birth != null)
                    GestureDetector(
                      onTap: () => setState(() => _birth = null),
                      child: Icon(Icons.close, size: 18, color: c.inkMuted),
                    ),
                ],
              ),
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
          Row(
            children: <Widget>[
              _Label('Контакты'),
              const Spacer(),
              TextButton.icon(
                onPressed: () => setState(() =>
                    _contacts.add(_EditContact(type: _contactTypes.first, value: TextEditingController()))),
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Добавить'),
              ),
            ],
          ),
          ..._contacts.asMap().entries.map((MapEntry<int, _EditContact> e) => _contactCard(c, e.key, e.value)),
        ],
      ),
    );
  }

  Widget _contactCard(AppColors c, int i, _EditContact ct) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(12, 10, 8, 12),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: SizedBox(
                  height: 34,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: _contactTypes
                        .map((String t) => Padding(
                              padding: const EdgeInsets.only(right: 6),
                              child: GestureDetector(
                                onTap: () => setState(() => ct.type = t),
                                child: Container(
                                  alignment: Alignment.center,
                                  padding: const EdgeInsets.symmetric(horizontal: 12),
                                  decoration: BoxDecoration(
                                      color: ct.type == t ? c.accent : c.chip, borderRadius: BorderRadius.circular(18)),
                                  child: Text(t,
                                      style: AppFonts.mono(
                                          size: 11, color: ct.type == t ? c.accentOn : c.inkMuted, weight: FontWeight.w600)),
                                ),
                              ),
                            ))
                        .toList(),
                  ),
                ),
              ),
              GestureDetector(
                onTap: () => setState(() {
                  _contacts.removeAt(i).value.dispose();
                }),
                child: Padding(
                  padding: const EdgeInsets.only(left: 4),
                  child: Icon(Icons.close, size: 18, color: c.inkMuted),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          TextField(
            controller: ct.value,
            decoration: InputDecoration(
              isDense: true,
              hintText: 'Значение',
              filled: true,
              fillColor: c.bg,
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.line)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.line)),
            ),
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
        TextField(
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
