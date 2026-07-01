import 'dart:io';
import 'dart:ui' as ui;

import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../api/client_auth.dart';
import '../widgets/auth_form.dart';

const List<String> _contactTypes = <String>['Телефон', 'WhatsApp', 'Telegram', 'MAX', 'Instagram', 'Прочее'];

class _EditContact {
  _EditContact({required this.type, required this.value});
  String type;
  final TextEditingController value;
}

/// Маска ввода даты рождения ДД.ММ.ГГГГ (цифры → группы 2.2.4).
class _BirthDateFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final String digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final String d = digits.length > 8 ? digits.substring(0, 8) : digits;
    final StringBuffer b = StringBuffer();
    for (int i = 0; i < d.length; i++) {
      if (i == 2 || i == 4) b.write('.');
      b.write(d[i]);
    }
    final String text = b.toString();
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}

/// ISO YYYY-MM-DD → отображение ДД.ММ.ГГГГ.
String _isoToDisplay(String? iso) {
  if (iso == null) return '';
  final RegExpMatch? m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(iso);
  return m == null ? '' : '${m.group(3)}.${m.group(2)}.${m.group(1)}';
}

/// Отображение ДД.ММ.ГГГГ → ISO YYYY-MM-DD; null при некорректной/неполной дате.
String? _displayToIso(String display) {
  final String digits = display.replaceAll(RegExp(r'\D'), '');
  if (digits.length != 8) return null;
  final int d = int.parse(digits.substring(0, 2));
  final int mo = int.parse(digits.substring(2, 4));
  final int y = int.parse(digits.substring(4, 8));
  if (y < 1900 || y > 2100) return null;
  final DateTime dt = DateTime(y, mo, d);
  if (dt.year != y || dt.month != mo || dt.day != d) return null;
  return '${digits.substring(4, 8)}-${digits.substring(2, 4)}-${digits.substring(0, 2)}';
}

/// Редактирование профиля клиента: аватар (выбор + квадратный кроп), имя/фамилия,
/// дата рождения (маска ДД.ММ.ГГГГ), о себе, контакты. Зеркало web ProfilePage (правка).
class ProfileEditScreen extends ConsumerStatefulWidget {
  const ProfileEditScreen({super.key, required this.account});
  final ClientAccount account;

  @override
  ConsumerState<ProfileEditScreen> createState() => _ProfileEditScreenState();
}

class _ProfileEditScreenState extends ConsumerState<ProfileEditScreen> {
  late final TextEditingController _first;
  late final TextEditingController _last;
  late final TextEditingController _bio;
  late final TextEditingController _birth;
  late final List<_EditContact> _contacts;
  late String? _avatarFileId = widget.account.avatarFileId;
  bool _busy = false;
  bool _avatarBusy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final ClientAccount a = widget.account;
    _first = TextEditingController(text: a.firstName);
    _last = TextEditingController(text: a.lastName);
    _bio = TextEditingController(text: a.bio ?? '');
    _birth = TextEditingController(text: _isoToDisplay(a.birthDate));
    _contacts = a.contacts
        .map((ClientContact c) => _EditContact(type: c.type, value: TextEditingController(text: c.value)))
        .toList();
  }

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _bio.dispose();
    _birth.dispose();
    for (final _EditContact c in _contacts) {
      c.value.dispose();
    }
    super.dispose();
  }

  Future<void> _pickAvatar() async {
    if (_avatarBusy) return;
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    final XFile? picked =
        await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 2048, imageQuality: 95);
    if (picked == null || !mounted) return;
    // Квадратный кроп (pan/zoom) в модалке → PNG-байты.
    final Uint8List? cropped = await showModalBottomSheet<Uint8List>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AvatarCropper(file: File(picked.path)),
    );
    if (cropped == null || !mounted) return;
    setState(() => _avatarBusy = true);
    try {
      // Пишем кроп рядом с исходником (cache-каталог, доступный на запись).
      final String dir = File(picked.path).parent.path;
      final String path = '$dir/avatar_cropped_${DateTime.now().millisecondsSinceEpoch}.png';
      await File(path).writeAsBytes(cropped, flush: true);
      final ClientAccount a = await ref.read(clientApiProvider).uploadAvatar(path, 'avatar.png');
      try {
        await File(path).delete();
      } catch (_) {}
      ref.invalidate(clientMeProvider);
      if (!mounted) return;
      setState(() {
        _avatarFileId = a.avatarFileId;
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
      await ref.read(clientApiProvider).removeAvatar();
      ref.invalidate(clientMeProvider);
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
    final String birthText = _birth.text.trim();
    final Map<String, dynamic> body = <String, dynamic>{
      'firstName': first,
      'lastName': last,
      'bio': _bio.text.trim().isEmpty ? null : _bio.text.trim(),
      'birthDate': birthText.isEmpty ? null : _displayToIso(birthText),
      'contacts': contacts,
    };
    try {
      await ref.read(clientApiProvider).updateProfile(body);
      ref.invalidate(clientMeProvider);
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Не удалось сохранить. Попробуйте снова.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final String? token = ref.watch(sessionProvider).token;
    final ClientApi api = ref.read(clientApiProvider);
    final String name = '${_first.text} ${_last.text}'.trim();
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: <Widget>[
            // Шапка: назад + заголовок.
            Row(
              children: <Widget>[
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: Icon(Icons.chevron_left, size: 26, color: c.ink),
                  tooltip: 'Назад',
                ),
                const SizedBox(width: 4),
                Text('Редактировать', style: AppFonts.display(size: 22, color: c.ink)),
              ],
            ),
            const SizedBox(height: 12),
            // Аватар: тап → выбор + кроп.
            Center(
              child: Column(
                children: <Widget>[
                  GestureDetector(
                    onTap: _avatarBusy ? null : _pickAvatar,
                    child: Stack(
                      alignment: Alignment.bottomRight,
                      children: <Widget>[
                        AuthedAvatar(
                          url: _avatarFileId != null ? api.avatarUrl(_avatarFileId!) : null,
                          token: token,
                          initials: name.isEmpty ? '' : name.substring(0, 1).toUpperCase(),
                          radius: 44,
                        ),
                        Container(
                          padding: const EdgeInsets.all(7),
                          decoration: BoxDecoration(
                              color: c.accent, shape: BoxShape.circle, border: Border.all(color: c.bg, width: 2)),
                          child: _avatarBusy
                              ? SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: c.accentOn))
                              : Icon(Icons.photo_camera, size: 16, color: c.accentOn),
                        ),
                      ],
                    ),
                  ),
                  if (_avatarFileId != null)
                    TextButton(
                      onPressed: _avatarBusy
                          ? null
                          : () async {
                              if (await confirmDelete(context, title: 'Удалить фото?')) _removeAvatar();
                            },
                      child: Text('Удалить', style: TextStyle(color: c.inkMuted, fontSize: 13)),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Expanded(child: AuthField(controller: _first, label: 'Имя', onChanged: (_) => setState(() {}))),
                const SizedBox(width: 12),
                Expanded(child: AuthField(controller: _last, label: 'Фамилия', onChanged: (_) => setState(() {}))),
              ],
            ),
            const SizedBox(height: 14),
            _Label('Дата рождения'),
            const SizedBox(height: 6),
            SelectAllTextField(
              controller: _birth,
              keyboardType: TextInputType.number,
              inputFormatters: <TextInputFormatter>[_BirthDateFormatter()],
              style: TextStyle(fontSize: 15, color: c.ink),
              decoration: InputDecoration(
                isDense: true,
                hintText: 'ДД.ММ.ГГГГ',
                filled: true,
                fillColor: c.chip,
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.line)),
                enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.line)),
                focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.accent, width: 1.6)),
              ),
            ),
            const SizedBox(height: 14),
            _Label('Контакты'),
            const SizedBox(height: 6),
            ..._contacts.asMap().entries.map((MapEntry<int, _EditContact> e) => _contactCard(c, e.key, e.value)),
            OutlinedButton.icon(
              onPressed: () => setState(() =>
                  _contacts.add(_EditContact(type: _contactTypes.first, value: TextEditingController()))),
              icon: Icon(Icons.add, size: 16, color: c.inkMuted),
              label: Text('Добавить контакт', style: TextStyle(color: c.inkMuted, fontWeight: FontWeight.w600)),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(46),
                side: BorderSide(color: c.line),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
            const SizedBox(height: 16),
            _Label('О себе / цели'),
            const SizedBox(height: 6),
            TextField(
              controller: _bio,
              maxLines: 4,
              maxLength: 2000,
              style: TextStyle(fontSize: 15, color: c.ink),
              decoration: InputDecoration(
                counterText: '',
                hintText: 'Цели, опыт, ограничения, что важно тренеру',
                filled: true,
                fillColor: c.chip,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.line)),
                enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.line)),
                focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.accent, width: 1.6)),
              ),
            ),
            if (_error != null) ...<Widget>[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: c.inkMuted, fontSize: 13)),
            ],
            const SizedBox(height: 20),
            AuthPrimaryButton(
              label: 'Сохранить',
              busyLabel: 'Сохранение…',
              busy: _busy,
              onPressed: _save,
            ),
          ],
        ),
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
                                      color: ct.type == t ? c.accent : c.chip,
                                      borderRadius: BorderRadius.circular(18)),
                                  child: Text(t,
                                      style: AppFonts.mono(
                                          size: 11,
                                          color: ct.type == t ? c.accentOn : c.inkMuted,
                                          weight: FontWeight.w600)),
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
          SelectAllTextField(
            controller: ct.value,
            style: TextStyle(fontSize: 15, color: c.ink),
            decoration: InputDecoration(
              isDense: true,
              hintText: 'Значение',
              filled: true,
              fillColor: c.chip,
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.line)),
              enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.line)),
              focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.accent, width: 1.6)),
            ),
          ),
        ],
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Text(text,
      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: context.colors.inkMuted));
}

/// Модалка квадратного кропа: pan/zoom исходника в рамке, вывод — квадратный PNG.
class _AvatarCropper extends StatefulWidget {
  const _AvatarCropper({required this.file});
  final File file;

  @override
  State<_AvatarCropper> createState() => _AvatarCropperState();
}

class _AvatarCropperState extends State<_AvatarCropper> {
  final TransformationController _ctrl = TransformationController();
  ui.Image? _image;
  bool _exporting = false;

  static const double _frame = 288; // сторона рамки кропа (px логических).
  static const int _out = 512; // сторона итогового PNG.

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final Uint8List bytes = await widget.file.readAsBytes();
    final ui.Codec codec = await ui.instantiateImageCodec(bytes);
    final ui.FrameInfo frame = await codec.getNextFrame();
    if (!mounted) return;
    setState(() => _image = frame.image);
  }

  @override
  void dispose() {
    _image?.dispose();
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _done() async {
    final ui.Image? img = _image;
    if (img == null || _exporting) return;
    setState(() => _exporting = true);
    try {
      // Геометрия: исходник вписан по центру в квадрат _frame (BoxFit.cover),
      // поверх — пользовательский pan/zoom из TransformationController.
      final Matrix4 view = _ctrl.value;
      final double scaleCover = _frame / (img.width < img.height ? img.width : img.height);
      final double drawW = img.width * scaleCover;
      final double drawH = img.height * scaleCover;
      final double baseDx = (_frame - drawW) / 2;
      final double baseDy = (_frame - drawH) / 2;

      final ui.PictureRecorder rec = ui.PictureRecorder();
      final Canvas canvas = Canvas(rec, Rect.fromLTWH(0, 0, _out.toDouble(), _out.toDouble()));
      final double k = _out / _frame; // масштаб логических → выходных px.
      canvas.scale(k, k);
      // Применяем тот же view-трансформ, что InteractiveViewer.
      canvas.transform(view.storage);
      final Paint paint = Paint()..filterQuality = FilterQuality.high;
      canvas.drawImageRect(
        img,
        Rect.fromLTWH(0, 0, img.width.toDouble(), img.height.toDouble()),
        Rect.fromLTWH(baseDx, baseDy, drawW, drawH),
        paint,
      );
      final ui.Image out = await rec.endRecording().toImage(_out, _out);
      final ByteData? png = await out.toByteData(format: ui.ImageByteFormat.png);
      out.dispose();
      if (!mounted) return;
      Navigator.of(context).pop<Uint8List>(png?.buffer.asUint8List());
    } catch (_) {
      if (!mounted) return;
      setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return SafeArea(
      child: Container(
        margin: const EdgeInsets.all(16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(24)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text('Кадрирование', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: c.ink)),
            const SizedBox(height: 4),
            Text('Двигайте и масштабируйте фото',
                style: TextStyle(fontSize: 13, color: c.inkMuted), textAlign: TextAlign.center),
            const SizedBox(height: 16),
            Center(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: SizedBox(
                  width: _frame,
                  height: _frame,
                  child: _image == null
                      ? Container(
                          color: c.chip,
                          alignment: Alignment.center,
                          child: const CircularProgressIndicator())
                      : Stack(
                          children: <Widget>[
                            InteractiveViewer(
                              transformationController: _ctrl,
                              clipBehavior: Clip.none,
                              minScale: 1,
                              maxScale: 4,
                              child: SizedBox(
                                width: _frame,
                                height: _frame,
                                child: RawImage(image: _image, fit: BoxFit.cover),
                              ),
                            ),
                            // Круглая подсказка зоны (как в вебе).
                            IgnorePointer(
                              child: Container(
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  border: Border.all(color: c.accentOn.withValues(alpha: 0.7), width: 2),
                                ),
                              ),
                            ),
                          ],
                        ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: <Widget>[
                Expanded(
                  child: OutlinedButton(
                    onPressed: _exporting ? null : () => Navigator.of(context).pop(),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      side: BorderSide(color: c.line),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text('Отмена', style: TextStyle(color: c.ink)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: AuthPrimaryButton(
                    label: 'Готово',
                    busyLabel: 'Готово…',
                    busy: _exporting,
                    onPressed: _done,
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
