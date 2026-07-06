import 'dart:async';

import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client_support.dart';

/// Время «ЧЧ:ММ» для подписи под пузырём (как в общем чате).
String _time(DateTime t) =>
    '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

/// Экран «Написать в поддержку»: переписка с поддержкой приложения
/// (GET /api/client-app/support/thread, POST /api/client-app/support через
/// [ClientSupportApi]). Лента опрашивается раз в ~10 сек, пока экран открыт;
/// при открытии — автоскролл к последнему сообщению.
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
  bool _loading = true; // первичная загрузка ленты
  bool _loadError = false; // ошибка загрузки при пустой ленте
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _loadThread(forceScroll: true);
    // Поллинг ленты, пока экран открыт (без внешних пакетов).
    _poll = Timer.periodic(const Duration(seconds: 10), (_) => _loadThread(silent: true));
  }

  @override
  void dispose() {
    _poll?.cancel();
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Загрузка переписки. [silent] — фоновое обновление (поллинг/pull-to-refresh):
  /// не показывает спиннер в ленте и не роняет её в ошибку. [forceScroll] —
  /// принудительно прокрутить вниз (первый вход/повтор). Иначе прокручиваем вниз
  /// только если появились новые сообщения и пользователь был у нижнего края.
  Future<void> _loadThread({bool silent = false, bool forceScroll = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _loadError = false;
      });
    }
    try {
      final List<SupportMessage> list = await ref.read(clientSupportApiProvider).thread();
      if (!mounted) return;
      final bool nearBottom = _isNearBottom();
      final bool changed = _differs(list);
      setState(() {
        _messages = list;
        _loading = false;
        _loadError = false;
      });
      if (forceScroll || (changed && nearBottom)) _scrollToBottom();
    } catch (_) {
      if (!mounted) return;
      if (!silent) {
        setState(() {
          _loading = false;
          _loadError = true;
        });
      }
      // silent: молча оставляем текущую ленту (сеть моргнула — не мешаем).
    }
  }

  /// Новый список отличается от текущего (по длине или последнему id).
  bool _differs(List<SupportMessage> next) {
    if (next.length != _messages.length) return true;
    if (next.isEmpty) return false;
    return next.last.id != _messages.last.id;
  }

  bool _isNearBottom() {
    if (!_scroll.hasClients) return true;
    final ScrollPosition p = _scroll.position;
    return p.pixels >= p.maxScrollExtent - 120;
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
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
      // Оптимистично показываем своё сообщение и прокручиваем вниз…
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
      _scrollToBottom();
      // …затем сверяемся с сервером (заменит оптимистичное реальным).
      await _loadThread(silent: true);
      _scrollToBottom();
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
      backgroundColor: c.bg,
      appBar: AppBar(title: const Text('Написать в поддержку')),
      body: Column(
        children: <Widget>[
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => _loadThread(silent: true),
              child: ListView(
                controller: _scroll,
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                children: _threadSection(c),
              ),
            ),
          ),
          _composer(c, canSend),
        ],
      ),
    );
  }

  /// Ветка ленты: спиннер (первая загрузка) → повтор (ошибка на пустой ленте) →
  /// подсказка (пусто) → пузыри. Пузыри: обращение пользователя справа (акцент),
  /// ответ поддержки слева (карточка с подписью «Поддержка»).
  List<Widget> _threadSection(AppColors c) {
    if (_loading) {
      return const <Widget>[
        Padding(
          padding: EdgeInsets.symmetric(vertical: 24),
          child: Center(
            child: SizedBox(
                width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)),
          ),
        ),
      ];
    }
    if (_loadError && _messages.isEmpty) {
      return <Widget>[
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text('Не удалось загрузить переписку',
                  style: TextStyle(fontSize: 14, height: 1.5, color: c.inkMuted)),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: () => _loadThread(forceScroll: true),
                child: const Text('Повторить'),
              ),
            ],
          ),
        ),
      ];
    }
    if (_messages.isEmpty) {
      return <Widget>[
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Text(
            'Здесь появится переписка. Напишите нам — ответим в этом чате.',
            style: TextStyle(fontSize: 14, height: 1.5, color: c.inkMuted),
          ),
        ),
      ];
    }
    return <Widget>[
      for (final SupportMessage msg in _messages) _SupportBubble(message: msg),
    ];
  }
}

/// Пузырь переписки с поддержкой. direction 'in' — обращение пользователя
/// (справа, акцентный фон), 'out' — ответ поддержки (слева, карточка с подписью).
class _SupportBubble extends StatelessWidget {
  const _SupportBubble({required this.message});
  final SupportMessage message;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final bool mine = message.isOutgoing;
    final Color bubbleColor = mine ? c.accent : c.card;
    final Color textColor = mine ? c.accentOn : c.ink;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
        decoration: BoxDecoration(color: bubbleColor, borderRadius: BorderRadius.circular(16)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            if (!mine)
              Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text('Поддержка',
                    style:
                        TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: c.inkMuted)),
              ),
            Text(message.text, style: TextStyle(fontSize: 14, height: 1.35, color: textColor)),
            const SizedBox(height: 2),
            Align(
              alignment: Alignment.centerRight,
              child: Text(_time(message.createdAt),
                  style: TextStyle(fontSize: 10, color: textColor.withValues(alpha: 0.7))),
            ),
          ],
        ),
      ),
    );
  }
}
