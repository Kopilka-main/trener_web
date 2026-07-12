import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/dev_mode_flag.dart';
import 'support_chat_screen.dart';

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

/// Экран помощи: раздел частых вопросов (FAQ) и переход к переписке с поддержкой.
class HelpScreen extends ConsumerWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bool devOn = ref.watch(devModeEnabledProvider);
    final bool financeHidden = ref.watch(financeHiddenProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Помощь с приложением')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        children: <Widget>[
          const _SectionHeader(icon: Icons.help_outline, title: 'Частые вопросы'),
          const SizedBox(height: 10),
          for (final _QA qa in _faq) _FaqTile(qa),
          const SizedBox(height: 20),
          const _SupportEntry(),
          const SizedBox(height: 20),
          const _SectionHeader(icon: Icons.tune, title: 'Дополнительно'),
          const SizedBox(height: 10),
          _ToggleCard(
            icon: Icons.bug_report_outlined,
            title: 'Режим разработчика',
            subtitle: 'Кнопка «Сообщить о проблеме» на экранах — помогайте тестировать и предлагать функции.',
            value: devOn,
            onChanged: (bool v) => ref.read(devModeEnabledProvider.notifier).set(v),
          ),
          const SizedBox(height: 8),
          _ToggleCard(
            icon: Icons.visibility_off_outlined,
            title: 'Скрыть финансы на главной',
            subtitle: 'Размывает суммы на плитке «Финансы» — удобно показывать приложение, не раскрывая доход.',
            value: financeHidden,
            onChanged: (bool v) => ref.read(financeHiddenProvider.notifier).setHidden(v),
          ),
        ],
      ),
    );
  }
}

/// Карточка-тумблер настройки: иконка-акцент, название, пояснение и Switch.
class _ToggleCard extends StatelessWidget {
  const _ToggleCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
      padding: const EdgeInsets.fromLTRB(16, 8, 10, 8),
      child: Row(
        children: <Widget>[
          Icon(icon, size: 24, color: c.accent),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.ink)),
                const SizedBox(height: 2),
                Text(subtitle, style: TextStyle(fontSize: 12.5, height: 1.35, color: c.inkMuted)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Switch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}

/// Заметный пункт-кнопка перехода на экран переписки с поддержкой.
class _SupportEntry extends StatelessWidget {
  const _SupportEntry();

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
      clipBehavior: Clip.antiAlias,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => Navigator.of(context).push<void>(
            MaterialPageRoute<void>(builder: (_) => const SupportChatScreen()),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: <Widget>[
                Icon(Icons.support_agent_outlined, size: 24, color: c.accent),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        'Написать в поддержку',
                        style: TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w700, color: c.ink),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Задать вопрос или сообщить о проблеме',
                        style: TextStyle(fontSize: 12.5, height: 1.35, color: c.inkMuted),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(Icons.chevron_right, color: c.inkMuted),
              ],
            ),
          ),
        ),
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
