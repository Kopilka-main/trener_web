import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_calendar_sync.dart';

/// Экран синхронизации расписания с Google/iPhone календарём через iCal-подписку.
/// Тренер копирует секретную ссылку и подписывается на неё в своём календаре —
/// занятия из приложения экспортируются односторонне и авто-обновляются.
class CalendarSyncScreen extends ConsumerWidget {
  const CalendarSyncScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<String> feed = ref.watch(calendarFeedUrlProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Синхронизация с календарём')),
      body: feed.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => Center(
          child: FilledButton(
            onPressed: () => ref.invalidate(calendarFeedUrlProvider),
            child: const Text('Повторить'),
          ),
        ),
        data: (String url) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: <Widget>[
            Text(
              'Подпишитесь на эту ссылку в Google или iPhone календаре — ваши занятия '
              'будут появляться там автоматически и обновляться при изменениях.',
              style: TextStyle(fontSize: 14, height: 1.4, color: c.ink),
            ),
            const SizedBox(height: 16),
            _LinkBox(url: url),
            const SizedBox(height: 20),
            _Section(
              icon: Icons.event,
              title: 'Google Календарь',
              steps: const <String>[
                'Откройте Google Календарь на компьютере (calendar.google.com).',
                'Слева «Другие календари» → «+» → «Подписаться по URL».',
                'Вставьте скопированную ссылку и нажмите «Добавить календарь».',
              ],
            ),
            const SizedBox(height: 16),
            _Section(
              icon: Icons.phone_iphone,
              title: 'Календарь на iPhone',
              steps: const <String>[
                'Настройки → Календарь → Учётные записи → Добавить учётную запись.',
                '«Другое» → «Подписной календарь».',
                'Вставьте ссылку в поле «Сервер» и нажмите «Далее» → «Сохранить».',
              ],
            ),
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Icon(Icons.info_outline, size: 18, color: c.inkMuted),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Обновление в стороннем календаре не мгновенное: Google и Apple '
                      'опрашивают ссылку по своему графику (от 15 минут до нескольких часов). '
                      'Ссылка секретная — не передавайте её посторонним.',
                      style: TextStyle(fontSize: 12, height: 1.4, color: c.inkMuted),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Блок со ссылкой и кнопкой копирования.
class _LinkBox extends StatelessWidget {
  const _LinkBox({required this.url});
  final String url;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          SelectableText(url, style: AppFonts.mono(size: 12, color: c.ink)),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: url));
              ScaffoldMessenger.of(context)
                  .showSnackBar(const SnackBar(content: Text('Ссылка скопирована')));
            },
            icon: const Icon(Icons.copy, size: 18),
            label: const Text('Скопировать ссылку'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
          ),
        ],
      ),
    );
  }
}

/// Секция инструкции: иконка, заголовок и нумерованные шаги.
class _Section extends StatelessWidget {
  const _Section({required this.icon, required this.title, required this.steps});
  final IconData icon;
  final String title;
  final List<String> steps;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          children: <Widget>[
            Icon(icon, size: 20, color: c.accent),
            const SizedBox(width: 8),
            Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.ink)),
          ],
        ),
        const SizedBox(height: 10),
        for (int i = 0; i < steps.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('${i + 1}.',
                    style: AppFonts.mono(size: 13, color: c.inkMuted, weight: FontWeight.w700)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(steps[i], style: TextStyle(fontSize: 13, height: 1.4, color: c.ink)),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
