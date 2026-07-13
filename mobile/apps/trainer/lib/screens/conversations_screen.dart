import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/trainer_chat.dart';

const List<String> _ruMonths = <String>[
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

bool _sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

/// Короткая отметка времени диалога: HH:MM сегодня, иначе «5 июн».
String _stamp(DateTime? t) {
  if (t == null) return '';
  final DateTime now = DateTime.now();
  if (_sameDay(t, now)) {
    return '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  }
  return '${t.day} ${_ruMonths[t.month - 1]}';
}

/// Список диалогов тренера с поиском клиента по имени.
class ConversationsScreen extends ConsumerStatefulWidget {
  const ConversationsScreen({super.key});

  @override
  ConsumerState<ConversationsScreen> createState() => _ConversationsScreenState();
}

class _ConversationsScreenState extends ConsumerState<ConversationsScreen> {
  final TextEditingController _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final AsyncValue<List<Conversation>> convos = ref.watch(trainerConversationsProvider);
    final String q = _search.text.trim().toLowerCase();
    return Scaffold(
      appBar: AppBar(title: const Text('Чаты'), automaticallyImplyLeading: false),
      body: Column(
        children: <Widget>[
          // Поиск клиента по имени.
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            child: SelectAllTextField(
              controller: _search,
              hintText: 'Поиск клиента',
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                prefixIcon: Icon(Icons.search, size: 20, color: c.inkMuted),
                filled: true,
                fillColor: c.card,
                isDense: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
              ),
            ),
          ),
          Expanded(
            child: convos.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (Object e, _) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    const Text('Не удалось загрузить чаты'),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: () => ref.invalidate(trainerConversationsProvider),
                      child: const Text('Повторить'),
                    ),
                  ],
                ),
              ),
              data: (List<Conversation> list) {
                final List<Conversation> filtered = q.isEmpty
                    ? list
                    : list.where((Conversation cv) => cv.clientName.toLowerCase().contains(q)).toList();
                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(trainerConversationsProvider),
                  child: filtered.isEmpty
                      ? ListView(
                          children: <Widget>[
                            SizedBox(height: MediaQuery.of(context).size.height * 0.25),
                            Center(
                                child: Text(list.isEmpty ? 'Диалогов пока нет' : 'Ничего не найдено',
                                    style: TextStyle(color: c.inkMuted))),
                          ],
                        )
                      : ListView.separated(
                          // Нижний отступ под плавающее меню (резерв уже в MediaQuery).
                          padding: EdgeInsets.only(bottom: MediaQuery.of(context).padding.bottom),
                          itemCount: filtered.length,
                          separatorBuilder: (_, _) => const Divider(height: 1, indent: 72),
                          itemBuilder: (BuildContext ctx, int i) => _ConvoTile(convo: filtered[i]),
                        ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ConvoTile extends StatelessWidget {
  const _ConvoTile({required this.convo});
  final Conversation convo;

  @override
  Widget build(BuildContext context) {
    final ColorScheme cs = Theme.of(context).colorScheme;
    final String initials = convo.clientName.isNotEmpty
        ? convo.clientName.trim().split(RegExp(r'\s+')).take(2).map((String w) => w[0]).join()
        : '?';
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: cs.primary.withValues(alpha: 0.18),
        child: Text(initials.toUpperCase(),
            style: TextStyle(color: cs.primary, fontWeight: FontWeight.w700, fontSize: 14)),
      ),
      title: Text(convo.clientName,
          maxLines: 1, overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w600)),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: <Widget>[
          Text(_stamp(convo.lastMessageAt),
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 4),
          if (convo.unreadCount > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(color: cs.primary, borderRadius: BorderRadius.circular(10)),
              child: Text('${convo.unreadCount}',
                  style: TextStyle(color: cs.onPrimary, fontSize: 12, fontWeight: FontWeight.w700)),
            ),
        ],
      ),
      onTap: () => context.push('/chat/${convo.clientId}?name=${Uri.encodeComponent(convo.clientName)}'),
    );
  }
}
