import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_theme.dart';
import 'chat_message.dart';

/// Отправка сообщения (с опциональным ответом). Возвращает true при успехе.
typedef SendMessage = Future<bool> Function(String body, String? replyToId);

/// Переиспользуемая лента диалога (зеркало веб ChatPage): пузыри по ролям, статус
/// прочтения (✓/✓✓), задачи с чекбоксом, закреплённые сообщения. Действия по
/// сообщению — долгим нажатием (ответить/закрепить/задача).
class ChatThreadView extends StatefulWidget {
  const ChatThreadView({
    super.key,
    required this.messages,
    required this.myRole,
    required this.onSend,
    this.otherReadAt,
    this.pinned = const <ChatMessage>[],
    this.onCompleteTask,
    this.onRefresh,
    this.onPin,
    this.onUnpin,
    this.onTask,
    this.onDelete,
  });

  final List<ChatMessage> messages;
  final SenderRole myRole;
  final SendMessage onSend;

  /// Когда собеседник в последний раз прочитал чат — для статуса ✓✓ на моих сообщениях.
  final DateTime? otherReadAt;

  /// Закреплённые сообщения (плашка сверху).
  final List<ChatMessage> pinned;

  /// Отметить задачу выполненной (только клиент). null → чекбокс только для чтения.
  final Future<void> Function(String id)? onCompleteTask;

  final Future<void> Function()? onRefresh;

  /// Действия по долгому нажатию (только тренер). null → пункт меню скрыт.
  /// Клиенту доступен только «Ответить».
  final Future<void> Function(ChatMessage message)? onPin;
  final Future<void> Function(ChatMessage message)? onUnpin;
  final Future<void> Function(ChatMessage message)? onTask;
  final Future<void> Function(ChatMessage message)? onDelete;

  @override
  State<ChatThreadView> createState() => _ChatThreadViewState();
}

class _ChatThreadViewState extends State<ChatThreadView> {
  final TextEditingController _ctrl = TextEditingController();
  final ScrollController _scroll = ScrollController();
  final Map<String, GlobalKey> _keys = <String, GlobalKey>{};
  bool _sending = false;
  ChatMessage? _replyTo;
  int _pinIdx = 0;
  String? _highlightId; // подсветка сообщения при переходе по цитате

  GlobalKey _keyFor(String id) => _keys.putIfAbsent(id, () => GlobalKey());

  @override
  void dispose() {
    _ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Переход к исходному сообщению по тапу на цитату ответа: прокручиваем к нему
  /// и кратко подсвечиваем. Если сообщение далеко (ещё не построено) — игнор.
  Future<void> _jumpTo(String id) async {
    final BuildContext? ctx = _keys[id]?.currentContext;
    if (ctx == null) return;
    await Scrollable.ensureVisible(ctx,
        duration: const Duration(milliseconds: 300), alignment: 0.4, curve: Curves.easeInOut);
    if (!mounted) return;
    setState(() => _highlightId = id);
    await Future<void>.delayed(const Duration(milliseconds: 1300));
    if (mounted) setState(() => _highlightId = null);
  }

  Future<void> _send() async {
    final String text = _ctrl.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    final String? replyId = _replyTo?.id;
    final bool ok = await widget.onSend(text, replyId);
    if (!mounted) return;
    setState(() {
      _sending = false;
      if (ok) {
        _ctrl.clear();
        _replyTo = null;
      }
    });
  }

  /// Меню действий по долгому нажатию на сообщение. Тренеру — закрепить/задача/
  /// ответить; клиенту — только ответить.
  void _showActions(ChatMessage m) {
    final AppColors c = context.colors;
    final bool isPinned = widget.pinned.any((ChatMessage p) => p.id == m.id);
    final bool canPin = (widget.onPin != null || widget.onUnpin != null) && m.kind == MessageKind.text;
    final bool canTask = widget.onTask != null && m.kind == MessageKind.text;
    HapticFeedback.selectionClick();
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: c.bg,
      builder: (BuildContext ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            _ActionTile(
              icon: Icons.reply,
              label: 'Ответить',
              onTap: () {
                Navigator.pop(ctx);
                setState(() => _replyTo = m);
              },
            ),
            if (canPin)
              _ActionTile(
                icon: isPinned ? Icons.push_pin : Icons.push_pin_outlined,
                label: isPinned ? 'Открепить' : 'Закрепить',
                onTap: () {
                  Navigator.pop(ctx);
                  if (isPinned) {
                    widget.onUnpin?.call(m);
                  } else {
                    widget.onPin?.call(m);
                  }
                },
              ),
            if (canTask)
              _ActionTile(
                icon: Icons.check_circle_outline,
                label: 'Задача',
                onTap: () {
                  Navigator.pop(ctx);
                  widget.onTask?.call(m);
                },
              ),
            if (widget.onDelete != null)
              _ActionTile(
                icon: Icons.delete_outline,
                label: 'Удалить',
                danger: true,
                onTap: () {
                  Navigator.pop(ctx);
                  widget.onDelete?.call(m);
                },
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final List<ChatMessage> ordered = widget.messages.reversed.toList();
    final ChatMessage? pin =
        widget.pinned.isNotEmpty ? widget.pinned[_pinIdx % widget.pinned.length] : null;

    return Column(
      children: <Widget>[
        if (pin != null) _PinnedBanner(
          message: pin,
          index: _pinIdx % widget.pinned.length,
          total: widget.pinned.length,
          onTap: () => setState(() {
            if (widget.pinned.length > 1) _pinIdx = (_pinIdx + 1) % widget.pinned.length;
          }),
        ),
        Expanded(
          // Тап по ленте убирает клавиатуру (как в вебе).
          child: GestureDetector(
            onTap: () => FocusScope.of(context).unfocus(),
            child: widget.messages.isEmpty
              ? _Empty(onRefresh: widget.onRefresh)
              : RefreshIndicator(
                  onRefresh: widget.onRefresh ?? () async {},
                  child: ListView.builder(
                    controller: _scroll,
                    reverse: true,
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                    itemCount: ordered.length,
                    itemBuilder: (BuildContext ctx, int i) {
                      final ChatMessage m = ordered[i];
                      final bool hl = _highlightId == m.id;
                      final Widget keyed = KeyedSubtree(
                        key: _keyFor(m.id),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          decoration: BoxDecoration(
                            color: hl ? context.colors.accent.withValues(alpha: 0.12) : Colors.transparent,
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: _Bubble(
                            message: m,
                            myRole: widget.myRole,
                            otherReadAt: widget.otherReadAt,
                            onCompleteTask: widget.onCompleteTask,
                            onJumpTo: _jumpTo,
                          ),
                        ),
                      );
                      if (m.kind == MessageKind.system) return keyed;
                      // Долгое нажатие → меню действий (ответить/закрепить/задача/удалить).
                      return GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onLongPress: () => _showActions(m),
                        child: keyed,
                      );
                    },
                  ),
                ),
          ),
        ),
        if (_replyTo != null) _ReplyPanel(
          message: _replyTo!,
          myRole: widget.myRole,
          onCancel: () => setState(() => _replyTo = null),
        ),
        _Composer(
          controller: _ctrl,
          sending: _sending,
          onSend: _send,
          divider: _replyTo == null,
        ),
      ],
    );
  }
}

/// Пункт меню действий (долгое нажатие на сообщение).
class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.icon, required this.label, required this.onTap, this.danger = false});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool danger;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final Color color = danger ? c.danger : c.ink;
    return ListTile(
      leading: Icon(icon, size: 22, color: color),
      title: Text(label, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: color)),
      onTap: onTap,
    );
  }
}

class _PinnedBanner extends StatelessWidget {
  const _PinnedBanner({
    required this.message,
    required this.index,
    required this.total,
    required this.onTap,
  });
  final ChatMessage message;
  final int index;
  final int total;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.line))),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: Row(
          children: <Widget>[
            Icon(Icons.push_pin_outlined, size: 15, color: c.accent),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(total > 1 ? 'Закреплённое · ${index + 1}/$total' : 'Закреплённое',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: c.accent)),
                  Text(message.body,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, color: c.ink)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.onRefresh});
  final Future<void> Function()? onRefresh;
  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh ?? () async {},
      child: ListView(
        children: <Widget>[
          SizedBox(height: MediaQuery.of(context).size.height * 0.3),
          Center(
            child: Text('Сообщений пока нет. Напишите первым.',
                style: TextStyle(color: context.colors.inkMuted)),
          ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({
    required this.message,
    required this.myRole,
    required this.otherReadAt,
    required this.onCompleteTask,
    this.onJumpTo,
  });
  final ChatMessage message;
  final SenderRole myRole;
  final DateTime? otherReadAt;
  final Future<void> Function(String id)? onCompleteTask;
  final Future<void> Function(String id)? onJumpTo;

  String _time(DateTime t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;

    if (message.kind == MessageKind.system) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
            decoration: BoxDecoration(color: c.chip, borderRadius: BorderRadius.circular(20)),
            child: Text(message.body,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 11, color: c.inkMuted)),
          ),
        ),
      );
    }

    if (message.kind == MessageKind.task) {
      final bool done = message.taskDone == true;
      return Align(
        alignment: Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 3),
          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.85),
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          decoration: BoxDecoration(
            color: c.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: c.accent.withValues(alpha: 0.4)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              GestureDetector(
                onTap: (done || onCompleteTask == null) ? null : () => onCompleteTask!(message.id),
                child: Container(
                  margin: const EdgeInsets.only(top: 1),
                  width: 20,
                  height: 20,
                  decoration: BoxDecoration(
                    color: done ? c.accent : Colors.transparent,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: done ? c.accent : c.inkMuted, width: 2),
                  ),
                  child: done ? Icon(Icons.check, size: 13, color: c.accentOn) : null,
                ),
              ),
              const SizedBox(width: 10),
              Flexible(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text('ЗАДАЧА',
                        style: TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w700, color: c.accent)),
                    const SizedBox(height: 2),
                    Text(message.body,
                        style: TextStyle(
                          fontSize: 14,
                          color: done ? c.inkMuted : c.ink,
                          decoration: done ? TextDecoration.lineThrough : null,
                        )),
                    const SizedBox(height: 2),
                    Text(_time(message.createdAt),
                        style: TextStyle(fontSize: 10, color: c.inkMuted)),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    final bool mine = message.senderRole == myRole;
    final bool read = otherReadAt != null && !message.createdAt.isAfter(otherReadAt!);
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
            if (message.replyTo != null)
              _ReplyQuote(
                reply: message.replyTo!,
                myRole: myRole,
                onColor: textColor,
                onTap: (onJumpTo != null && message.replyTo!.id.isNotEmpty)
                    ? () => onJumpTo!(message.replyTo!.id)
                    : null,
              ),
            Text(message.body, style: TextStyle(fontSize: 14, color: textColor)),
            const SizedBox(height: 2),
            Row(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.end,
              children: <Widget>[
                Text(_time(message.createdAt),
                    style: TextStyle(fontSize: 10, color: textColor.withValues(alpha: 0.7))),
                if (mine) ...<Widget>[
                  const SizedBox(width: 3),
                  Icon(read ? Icons.done_all : Icons.done,
                      size: 13, color: textColor.withValues(alpha: 0.7)),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ReplyQuote extends StatelessWidget {
  const _ReplyQuote({required this.reply, required this.myRole, required this.onColor, this.onTap});
  final ReplyPreview reply;
  final SenderRole myRole;
  final Color onColor;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(6),
        border: Border(left: BorderSide(color: onColor.withValues(alpha: 0.4), width: 2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(reply.senderRole == myRole ? 'Вы' : (myRole == SenderRole.client ? 'Тренер' : 'Клиент'),
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: onColor.withValues(alpha: 0.9))),
          Text(reply.body,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 11, color: onColor.withValues(alpha: 0.9))),
        ],
      ),
      ),
    );
  }
}

class _ReplyPanel extends StatelessWidget {
  const _ReplyPanel({required this.message, required this.myRole, required this.onCancel});
  final ChatMessage message;
  final SenderRole myRole;
  final VoidCallback onCancel;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final bool fromMe = message.senderRole == myRole;
    return Container(
      decoration: BoxDecoration(border: Border(top: BorderSide(color: c.line))),
      padding: const EdgeInsets.fromLTRB(16, 8, 8, 0),
      child: Row(
        children: <Widget>[
          Icon(Icons.reply, size: 15, color: c.accent),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(fromMe ? 'Ответ на ваше' : 'Ответ',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: c.accent)),
                Text(message.body,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13, color: c.inkMuted)),
              ],
            ),
          ),
          IconButton(
            onPressed: onCancel,
            icon: Icon(Icons.close, size: 16, color: c.inkMuted),
            tooltip: 'Отменить ответ',
          ),
        ],
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.sending,
    required this.onSend,
    required this.divider,
  });
  final TextEditingController controller;
  final bool sending;
  final VoidCallback onSend;
  final bool divider;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      decoration: divider
          ? BoxDecoration(border: Border(top: BorderSide(color: c.line)))
          : null,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 6, 12, 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              Expanded(
                child: TextField(
                  controller: controller,
                  minLines: 1,
                  maxLines: 5,
                  maxLength: 4000,
                  textInputAction: TextInputAction.newline,
                  decoration: InputDecoration(
                    hintText: 'Сообщение…',
                    counterText: '',
                    filled: true,
                    fillColor: c.chip,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(22),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                height: 44,
                width: 44,
                child: IconButton.filled(
                  onPressed: sending ? null : onSend,
                  icon: sending
                      ? const SizedBox(
                          height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.arrow_upward, size: 20),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
