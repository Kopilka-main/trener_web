import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client_support.dart';

/// Пара «вопрос-ответ» для раздела «Частые вопросы».
class _Faq {
  const _Faq(this.q, this.a);
  final String q;
  final String a;
}

/// Черновые FAQ для клиентского приложения (владелец потом отредактирует).
const List<_Faq> _faqs = <_Faq>[
  _Faq(
    'Как подключиться к тренеру?',
    'Тренер добавляет вас сам. Откройте «Профиль» → «ID пользователя», покажите тренеру '
        'QR-код или назовите свой ID. После привязки тренер, ваши тренировки и расписание '
        'появятся в приложении.',
  ),
  _Faq(
    'Где переключить тёмную или светлую тему?',
    'Откройте «Профиль» и в разделе «Тема» выберите «Светлая» или «Тёмная». '
        'Выбор сохраняется на этом устройстве.',
  ),
  _Faq(
    'Забыли пароль — как восстановить?',
    'На экране входа нажмите «Забыли пароль?» и укажите email. Мы пришлём на почту '
        '6-значный код — введите его вместе с новым паролем. Код действует 15 минут.',
  ),
  _Faq(
    'Можно ли входить через VK или Яндекс?',
    'Да. На экране входа выберите «Войти через VK» или «Войти через Яндекс». Если к аккаунту '
        'привязана та же почта, вход выполнится в ваш профиль.',
  ),
  _Faq(
    'Как включить напоминания о тренировках?',
    'В «Профиле» включите «Push-уведомления», затем — «Напоминать за час до тренировки». '
        'Разрешение на уведомления запросит телефон; отключить их можно в настройках телефона.',
  ),
  _Faq(
    'Где смотреть тренировки, замеры и фото прогресса?',
    'Проведённые занятия — в разделе «Тренировки», замеры тела и фото прогресса — в разделе '
        '«Прогресс». Данные появляются после того, как тренер проведёт тренировку или добавит замер.',
  ),
  _Faq(
    'Где увидеть предстоящие платежи и рассрочку?',
    'Напоминания о предстоящих платежах и рассрочке приходят в раздел «Уведомления». '
        'По деталям и способам оплаты пишите тренеру напрямую — в разделе «Чат».',
  ),
];

/// Экран «Помощь с приложением»: раскрывающиеся частые вопросы и форма обращения
/// в поддержку (POST /api/client-app/support через [ClientSupportApi]).
class HelpScreen extends ConsumerStatefulWidget {
  const HelpScreen({super.key});

  @override
  ConsumerState<HelpScreen> createState() => _HelpScreenState();
}

class _HelpScreenState extends ConsumerState<HelpScreen> {
  final TextEditingController _text = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final String text = _text.text.trim();
    if (text.isEmpty || _sending) return;
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    setState(() => _sending = true);
    try {
      await ref.read(clientSupportApiProvider).send(text);
      if (!mounted) return;
      _text.clear();
      m.showSnackBar(const SnackBar(content: Text('Обращение отправлено')));
    } catch (_) {
      if (!mounted) return;
      m.showSnackBar(const SnackBar(content: Text('Не удалось отправить, попробуйте позже')));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final bool canSend = _text.text.trim().isNotEmpty && !_sending;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(title: const Text('Помощь с приложением')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: <Widget>[
          const _SectionLabel('Частые вопросы'),
          const SizedBox(height: 8),
          for (final _Faq f in _faqs) _FaqTile(faq: f),
          const SizedBox(height: 20),
          const _SectionLabel('Написать в поддержку'),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
            child: TextField(
              controller: _text,
              minLines: 5,
              maxLines: 6,
              maxLength: 5000,
              enabled: !_sending,
              keyboardType: TextInputType.multiline,
              textInputAction: TextInputAction.newline,
              onChanged: (_) => setState(() {}),
              style: TextStyle(fontSize: 15, height: 1.4, color: c.ink),
              decoration: InputDecoration(
                border: InputBorder.none,
                counterText: '',
                hintText: 'Опишите проблему или вопрос',
                hintStyle: TextStyle(color: c.inkMuted),
              ),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: canSend ? _send : null,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
            child: _sending
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Отправить'),
          ),
          const SizedBox(height: 8),
          Text('Мы ответим в чате или на почту, указанную в профиле.',
              style: TextStyle(fontSize: 13, color: c.inkMutedXl)),
        ],
      ),
    );
  }
}

/// Раскрывающаяся карточка вопрос-ответ (нейтральные ink-токены, без ярких цветов).
class _FaqTile extends StatefulWidget {
  const _FaqTile({required this.faq});
  final _Faq faq;

  @override
  State<_FaqTile> createState() => _FaqTileState();
}

class _FaqTileState extends State<_FaqTile> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => setState(() => _open = !_open),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: Text(widget.faq.q,
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                  ),
                  const SizedBox(width: 12),
                  AnimatedRotation(
                    turns: _open ? 0.5 : 0,
                    duration: const Duration(milliseconds: 180),
                    child: Icon(Icons.expand_more, size: 22, color: c.inkMuted),
                  ),
                ],
              ),
            ),
          ),
          AnimatedCrossFade(
            firstChild: const SizedBox(width: double.infinity),
            secondChild: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
              child: Text(widget.faq.a, style: TextStyle(fontSize: 14, height: 1.5, color: c.inkMuted)),
            ),
            crossFadeState: _open ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 180),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Text(text,
      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: context.colors.inkMuted));
}
