import 'dart:async';

import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_support.dart';

const List<String> _ruMonths = <String>[
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

bool _sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

/// Короткая отметка времени сообщения: HH:MM сегодня, иначе «5 июн, HH:MM».
String _stamp(DateTime t) {
  final String hhmm =
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  if (_sameDay(t, DateTime.now())) return hhmm;
  return '${t.day} ${_ruMonths[t.month - 1]}, $hhmm';
}

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
  final ScrollController _scroll = ScrollController();
  Timer? _poll;

  List<SupportMessage> _messages = <SupportMessage>[];
  bool _loaded = false; // первичная загрузка ленты завершена (успех или ошибка)
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _reload();
    // Лёгкий поллинг ответов поддержки, пока экран открыт.
    _poll = Timer.periodic(const Duration(seconds: 10), (_) => _reload());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Перезапросить переписку. При ошибке молча оставляем текущую ленту, но
  /// снимаем крутилку первичной загрузки, чтобы показать подсказку/накопленное.
  Future<void> _reload({bool scrollToEnd = false}) async {
    try {
      final List<SupportMessage> msgs =
          await ref.read(trainerSupportApiProvider).thread();
      if (!mounted) return;
      setState(() {
        _messages = msgs;
        _loaded = true;
      });
      if (scrollToEnd) _scrollToEndSoon();
    } catch (_) {
      if (mounted) setState(() => _loaded = true);
    }
  }

  /// Прокрутить ленту к последнему сообщению после отрисовки нового кадра.
  void _scrollToEndSoon() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
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
      // Оптимистично показываем своё обращение сразу, до синхронизации с сервером.
      setState(() {
        _messages = <SupportMessage>[
          ..._messages,
          SupportMessage(
            id: 'local-${DateTime.now().microsecondsSinceEpoch}',
            direction: 'in',
            text: text,
            createdAt: DateTime.now(),
          ),
        ];
      });
      _scrollToEndSoon();
      // Синхронизируемся: получим настоящий id и возможные новые ответы.
      await _reload(scrollToEnd: true);
    } catch (_) {
      if (!mounted) return;
      m.showSnackBar(const SnackBar(content: Text('Не удалось отправить, попробуйте позже')));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  /// Композер обращения: поле ввода с кнопкой-отправкой ВНУТРИ, закреплён снизу —
  /// при открытии клавиатуры Scaffold поджимает тело и композер остаётся над ней.
  Widget _composer(AppColors c, bool canSend) {
    return Container(
      decoration: BoxDecoration(
        color: c.bg,
        border: Border(top: BorderSide(color: c.line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: Container(
            decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(24)),
            padding: const EdgeInsets.fromLTRB(16, 2, 6, 2),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: <Widget>[
                Expanded(
                  child: TextField(
                    controller: _text,
                    minLines: 1,
                    maxLines: 5,
                    maxLength: 5000,
                    enabled: !_sending,
                    keyboardType: TextInputType.multiline,
                    textInputAction: TextInputAction.newline,
                    onChanged: (_) => setState(() {}),
                    style: TextStyle(fontSize: 15, height: 1.35, color: c.ink),
                    decoration: InputDecoration(
                      isDense: true,
                      border: InputBorder.none,
                      counterText: '',
                      hintText: 'Написать в поддержку…',
                      hintStyle: TextStyle(color: c.inkMuted),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Material(
                    color: canSend ? c.accent : c.chip,
                    shape: const CircleBorder(),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: canSend ? _send : null,
                      child: SizedBox(
                        width: 40,
                        height: 40,
                        child: _sending
                            ? Padding(
                                padding: const EdgeInsets.all(11),
                                child: CircularProgressIndicator(strokeWidth: 2, color: c.accentOn),
                              )
                            : Icon(Icons.arrow_upward,
                                size: 20, color: canSend ? c.accentOn : c.inkMuted),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final bool canSend = _text.text.trim().isNotEmpty && !_sending;
    return Scaffold(
      appBar: AppBar(title: const Text('Помощь с приложением')),
      body: Column(
        children: <Widget>[
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => _reload(),
              color: c.accent,
              child: ListView(
                controller: _scroll,
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                children: <Widget>[
                  const _SectionHeader(icon: Icons.help_outline, title: 'Частые вопросы'),
                  const SizedBox(height: 10),
                  for (final _QA qa in _faq) _FaqTile(qa),
                  const SizedBox(height: 20),
                  const _SectionHeader(
                      icon: Icons.forum_outlined, title: 'Переписка с поддержкой'),
                  const SizedBox(height: 12),
                  ..._thread(c),
                ],
              ),
            ),
          ),
          _composer(c, canSend),
        ],
      ),
    );
  }

  /// Содержимое ленты переписки: крутилка при первичной загрузке, подсказка при
  /// пустой переписке, иначе — пузыри сообщений.
  List<Widget> _thread(AppColors c) {
    if (!_loaded && _messages.isEmpty) {
      return <Widget>[
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 24),
          child: Center(
            child: SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2, color: c.accent),
            ),
          ),
        ),
      ];
    }
    if (_messages.isEmpty) {
      return <Widget>[
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
          decoration: BoxDecoration(
            color: c.card,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            'Опишите проблему — ответим здесь. Переписка появится после первого сообщения.',
            style: TextStyle(fontSize: 14, height: 1.45, color: c.inkMuted),
          ),
        ),
      ];
    }
    return <Widget>[
      for (final SupportMessage msg in _messages) _MessageBubble(msg),
    ];
  }
}

/// Пузырь одного сообщения переписки: обращение тренера (`in`) — справа с
/// акцентным фоном; ответ поддержки (`out`) — слева на карточке, с подписью.
class _MessageBubble extends StatelessWidget {
  const _MessageBubble(this.message);
  final SupportMessage message;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final bool mine = message.isMine;
    final Color textColor = mine ? c.accentOn : c.ink;
    final Color timeColor =
        mine ? c.accentOn.withValues(alpha: 0.7) : c.inkMutedXl;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.78,
        ),
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
        decoration: BoxDecoration(
          color: mine ? c.accent : c.card,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(mine ? 16 : 4),
            bottomRight: Radius.circular(mine ? 4 : 16),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            if (!mine) ...<Widget>[
              Text(
                'Поддержка',
                style: TextStyle(
                    fontSize: 11.5, fontWeight: FontWeight.w700, color: c.inkMuted),
              ),
              const SizedBox(height: 3),
            ],
            Text(
              message.text,
              style: TextStyle(fontSize: 15, height: 1.35, color: textColor),
            ),
            const SizedBox(height: 4),
            Text(
              _stamp(message.createdAt),
              style: AppFonts.mono(size: 10, color: timeColor, weight: FontWeight.w600),
            ),
          ],
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
