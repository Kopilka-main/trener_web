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

/// Экран переписки с поддержкой: лента сообщений и композер обращения снизу.
/// Пока экран открыт, ответы поддержки подтягиваются лёгким поллингом.
class SupportChatScreen extends ConsumerStatefulWidget {
  const SupportChatScreen({super.key});

  @override
  ConsumerState<SupportChatScreen> createState() => _SupportChatScreenState();
}

class _SupportChatScreenState extends ConsumerState<SupportChatScreen> {
  final TextEditingController _text = TextEditingController();
  final ScrollController _scroll = ScrollController();
  Timer? _poll;

  List<SupportMessage> _messages = <SupportMessage>[];
  bool _loaded = false; // первичная загрузка ленты завершена (успех или ошибка)
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    // Первичная загрузка с автоскроллом к последнему сообщению при открытии.
    _reload(scrollToEnd: true);
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
              crossAxisAlignment: CrossAxisAlignment.center,
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
      appBar: AppBar(title: const Text('Написать в поддержку')),
      body: Column(
        children: <Widget>[
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => _reload(),
              color: c.accent,
              child: ListView(
                controller: _scroll,
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                children: _thread(c),
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
