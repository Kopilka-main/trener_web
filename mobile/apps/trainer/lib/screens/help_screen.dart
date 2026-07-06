import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_support.dart';

/// Пара «вопрос — ответ» для раздела частых вопросов.
class _QA {
  const _QA(this.q, this.a);
  final String q;
  final String a;
}

/// Частые вопросы тренерского приложения. Легко редактируемый список —
/// добавляйте/меняйте пары «вопрос — ответ» прямо здесь.
const List<_QA> _faq = <_QA>[
  _QA(
    'Как переключить тёмную или светлую тему?',
    'Откройте «Профиль» → раздел «Тема» и выберите «Система», «Светлая» или «Тёмная». '
        'Вариант «Система» подстраивается под настройки телефона.',
  ),
  _QA(
    'Как синхронизировать расписание с Google или iPhone календарём?',
    'В «Профиле» откройте «Синхронизация с календарём», скопируйте секретную ссылку и '
        'подпишитесь на неё в своём календаре. Занятия появятся автоматически и будут '
        'обновляться сами.',
  ),
  _QA(
    'Как восстановить пароль?',
    'На экране входа нажмите «Забыли пароль?» и укажите почту, на которую зарегистрирован '
        'аккаунт. Мы пришлём письмо со ссылкой для установки нового пароля.',
  ),
  _QA(
    'Как войти через VK или Яндекс?',
    'На экране входа нажмите кнопку VK или Яндекс и подтвердите доступ. Аккаунт привяжется '
        'к вашей почте — дальше можно входить любым способом.',
  ),
  _QA(
    'Как привязать клиента по QR-коду?',
    'Попросите клиента открыть свой QR-код в приложении и отсканируйте его при добавлении '
        'клиента. Аккаунт клиента свяжется с вашим автоматически.',
  ),
  _QA(
    'Как настроить рассрочку и учитывать доходы?',
    'В карточке клиента оформите абонемент или пакет занятий и при необходимости разбейте '
        'оплату на части. Все поступления и виды доходов отражаются в разделе «Финансы».',
  ),
  _QA(
    'Как добавить замеры и фото прогресса клиента?',
    'Откройте карточку клиента и перейдите на вкладку «Прогресс». Там можно внести замеры и '
        'вес, загрузить фото, а также поставить клиенту задачу сделать замер.',
  ),
  _QA(
    'Как провести тренировку?',
    'Откройте тренировку клиента и нажмите «Начать». Отмечайте выполненные подходы; таймер '
        'отдыха и звуковые сигналы помогут держать темп. По завершении сохраните результат — '
        'он попадёт в историю клиента.',
  ),
];

/// Экран помощи: раздел частых вопросов (FAQ) и форма обращения в поддержку.
class HelpScreen extends ConsumerStatefulWidget {
  const HelpScreen({super.key});

  @override
  ConsumerState<HelpScreen> createState() => _HelpScreenState();
}

class _HelpScreenState extends ConsumerState<HelpScreen> {
  final TextEditingController _text = TextEditingController();
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _text.addListener(_onChanged);
  }

  void _onChanged() => setState(() {});

  @override
  void dispose() {
    _text.removeListener(_onChanged);
    _text.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final String text = _text.text.trim();
    if (text.isEmpty || _sending) return;
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    setState(() => _sending = true);
    try {
      await ref.read(trainerSupportApiProvider).send(text);
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
      appBar: AppBar(title: const Text('Помощь с приложением')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: <Widget>[
          const _SectionHeader(icon: Icons.help_outline, title: 'Частые вопросы'),
          const SizedBox(height: 10),
          for (final _QA qa in _faq) _FaqTile(qa),
          const SizedBox(height: 28),
          const _SectionHeader(icon: Icons.support_agent_outlined, title: 'Написать в поддержку'),
          const SizedBox(height: 10),
          Text(
            'Опишите проблему или задайте вопрос — мы ответим на почту вашего аккаунта.',
            style: TextStyle(fontSize: 14, height: 1.4, color: c.inkMuted),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _text,
            maxLines: 5,
            maxLength: 5000,
            enabled: !_sending,
            textInputAction: TextInputAction.newline,
            decoration: InputDecoration(
              hintText: 'Опишите проблему или вопрос',
              filled: true,
              fillColor: c.card,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: canSend ? _send : null,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            child: _sending
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Отправить'),
          ),
        ],
      ),
    );
  }
}

/// Заголовок раздела: иконка-акцент и название.
class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.icon, required this.title});
  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Row(
      children: <Widget>[
        Icon(icon, size: 20, color: c.accent),
        const SizedBox(width: 8),
        Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.ink)),
      ],
    );
  }
}

/// Раскрывающийся блок «вопрос — ответ» без ярких цветов, на карточке темы.
class _FaqTile extends StatelessWidget {
  const _FaqTile(this.qa);
  final _QA qa;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
      clipBehavior: Clip.antiAlias,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          title: Text(
            qa.q,
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink),
          ),
          iconColor: c.inkMuted,
          collapsedIconColor: c.inkMuted,
          expandedAlignment: Alignment.centerLeft,
          expandedCrossAxisAlignment: CrossAxisAlignment.start,
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: <Widget>[
            Text(qa.a, style: TextStyle(fontSize: 14, height: 1.45, color: c.ink)),
          ],
        ),
      ),
    );
  }
}
