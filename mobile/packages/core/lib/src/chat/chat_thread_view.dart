import 'package:flutter/material.dart';

import 'chat_message.dart';

/// Отправка нового сообщения. Возвращает true при успехе (поле ввода очищается).
typedef SendMessage = Future<bool> Function(String body);

/// Переиспользуемая лента диалога: пузыри сообщений + поле ввода снизу.
/// `myRole` — чья сторона «я» (свои сообщения справа, акцентом).
class ChatThreadView extends StatefulWidget {
  const ChatThreadView({
    super.key,
    required this.messages,
    required this.myRole,
    required this.onSend,
    this.onRefresh,
  });

  final List<ChatMessage> messages;
  final SenderRole myRole;
  final SendMessage onSend;
  final Future<void> Function()? onRefresh;

  @override
  State<ChatThreadView> createState() => _ChatThreadViewState();
}

class _ChatThreadViewState extends State<ChatThreadView> {
  final TextEditingController _ctrl = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final String text = _ctrl.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    final bool ok = await widget.onSend(text);
    if (!mounted) return;
    setState(() => _sending = false);
    if (ok) _ctrl.clear();
  }

  @override
  Widget build(BuildContext context) {
    // reverse:true — лента растёт снизу вверх; новейшие внизу. Поэтому
    // отображаем в обратном порядке (от свежих к старым).
    final List<ChatMessage> ordered = widget.messages.reversed.toList();
    return Column(
      children: <Widget>[
        Expanded(
          child: widget.messages.isEmpty
              ? _EmptyThread(onRefresh: widget.onRefresh)
              : RefreshIndicator(
                  onRefresh: widget.onRefresh ?? () async {},
                  child: ListView.builder(
                    reverse: true,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    itemCount: ordered.length,
                    itemBuilder: (BuildContext ctx, int i) =>
                        _Bubble(message: ordered[i], myRole: widget.myRole),
                  ),
                ),
        ),
        _Composer(controller: _ctrl, sending: _sending, onSend: _send),
      ],
    );
  }
}

class _EmptyThread extends StatelessWidget {
  const _EmptyThread({required this.onRefresh});
  final Future<void> Function()? onRefresh;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh ?? () async {},
      child: ListView(
        children: <Widget>[
          SizedBox(height: MediaQuery.of(context).size.height * 0.3),
          Center(
            child: Text('Сообщений пока нет',
                style: Theme.of(context).textTheme.bodyMedium),
          ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.myRole});
  final ChatMessage message;
  final SenderRole myRole;

  String _time(DateTime t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final ColorScheme cs = Theme.of(context).colorScheme;

    // Системная плашка — по центру, без пузыря.
    if (message.kind == MessageKind.system) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Center(
          child: Text(message.body,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
        ),
      );
    }

    final bool mine = message.senderRole == myRole;
    final Color bubbleColor = mine ? cs.primary : cs.surfaceContainerHighest;
    final Color textColor = mine ? cs.onPrimary : cs.onSurface;

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
        decoration: BoxDecoration(
          color: bubbleColor,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(14),
            topRight: const Radius.circular(14),
            bottomLeft: Radius.circular(mine ? 14 : 4),
            bottomRight: Radius.circular(mine ? 4 : 14),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            if (message.kind == MessageKind.task)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Icon(
                    message.taskDone == true
                        ? Icons.check_circle
                        : Icons.radio_button_unchecked,
                    size: 15,
                    color: textColor,
                  ),
                  const SizedBox(width: 6),
                  Text('Задача',
                      style: TextStyle(
                          fontSize: 11, fontWeight: FontWeight.w700, color: textColor)),
                ],
              ),
            Text(message.body, style: TextStyle(fontSize: 15, color: textColor)),
            const SizedBox(height: 2),
            Text(_time(message.createdAt),
                style: TextStyle(fontSize: 10, color: textColor.withValues(alpha: 0.7))),
          ],
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({required this.controller, required this.sending, required this.onSend});
  final TextEditingController controller;
  final bool sending;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final ColorScheme cs = Theme.of(context).colorScheme;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: <Widget>[
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 5,
                textInputAction: TextInputAction.newline,
                decoration: InputDecoration(
                  hintText: 'Сообщение…',
                  filled: true,
                  fillColor: cs.surfaceContainerHighest,
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
              height: 46,
              width: 46,
              child: IconButton.filled(
                onPressed: sending ? null : onSend,
                icon: sending
                    ? const SizedBox(
                        height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.send, size: 20),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
