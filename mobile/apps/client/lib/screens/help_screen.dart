import 'package:core/core.dart';
import 'package:flutter/material.dart';

import 'support_chat_screen.dart';

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

/// Экран «Помощь с приложением»: раскрывающиеся частые вопросы и переход к
/// переписке с поддержкой ([SupportChatScreen]).
class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(title: const Text('Помощь с приложением')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: <Widget>[
          const _SectionLabel('Частые вопросы'),
          const SizedBox(height: 8),
          for (final _Faq f in _faqs) _FaqTile(faq: f),
          const SizedBox(height: 16),
          _SupportButton(
            onTap: () => Navigator.of(context).push<void>(
              MaterialPageRoute<void>(builder: (_) => const SupportChatScreen()),
            ),
          ),
        ],
      ),
    );
  }
}

/// Заметный пункт «Написать в поддержку» → экран переписки с поддержкой.
class _SupportButton extends StatelessWidget {
  const _SupportButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
        child: Row(
          children: <Widget>[
            Icon(Icons.support_agent_outlined, size: 22, color: c.ink),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text('Написать в поддержку',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                  const SizedBox(height: 2),
                  Text('Задать вопрос или сообщить о проблеме',
                      style: TextStyle(fontSize: 12, color: c.inkMutedXl)),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Icon(Icons.chevron_right, size: 20, color: c.inkMutedXl),
          ],
        ),
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
