import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/trainer_clients.dart';

enum _Tab { active, archived }

final StateProvider<_Tab> _tabProvider = StateProvider<_Tab>((_) => _Tab.active);

class ClientsScreen extends ConsumerWidget {
  const ClientsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Client>> clients = ref.watch(trainerClientsProvider);
    final _Tab tab = ref.watch(_tabProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Клиенты')),
      body: clients.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Text('Не удалось загрузить клиентов'),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => ref.invalidate(trainerClientsProvider),
                child: const Text('Повторить'),
              ),
            ],
          ),
        ),
        data: (List<Client> all) {
          final List<Client> filtered = all.where((Client c) {
            return tab == _Tab.active
                ? c.status == ClientStatus.active
                : c.status == ClientStatus.archived;
          }).toList();
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(trainerClientsProvider),
            child: filtered.isEmpty
                ? ListView(
                    children: <Widget>[
                      SizedBox(height: MediaQuery.of(context).size.height * 0.3),
                      Center(
                        child: Text(
                          tab == _Tab.active ? 'Нет активных клиентов' : 'Архив пуст',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ),
                    ],
                  )
                : ListView.separated(
                    itemCount: filtered.length,
                    separatorBuilder: (_, _) => const Divider(height: 1, indent: 72),
                    itemBuilder: (BuildContext ctx, int i) => _ClientTile(client: filtered[i]),
                  ),
          );
        },
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: SegmentedButton<_Tab>(
          segments: const <ButtonSegment<_Tab>>[
            ButtonSegment<_Tab>(value: _Tab.active, label: Text('Активные')),
            ButtonSegment<_Tab>(value: _Tab.archived, label: Text('Архив')),
          ],
          selected: <_Tab>{tab},
          onSelectionChanged: (Set<_Tab> s) => ref.read(_tabProvider.notifier).state = s.first,
        ),
      ),
    );
  }
}

class _ClientTile extends StatelessWidget {
  const _ClientTile({required this.client});
  final Client client;

  @override
  Widget build(BuildContext context) {
    final ColorScheme cs = Theme.of(context).colorScheme;
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: cs.primary.withValues(alpha: 0.18),
        child: Text(client.initials,
            style: TextStyle(color: cs.primary, fontWeight: FontWeight.w700, fontSize: 14)),
      ),
      title: Text(client.fullName.isNotEmpty ? client.fullName : 'Без имени',
          maxLines: 1, overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(
        <String>[
          client.isOnline ? 'Онлайн' : 'Очно',
          if (client.phone?.trim().isNotEmpty == true) client.phone!.trim(),
        ].join(' · '),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: Icon(Icons.chevron_right, color: cs.onSurfaceVariant),
      onTap: () => context.push('/client/${client.id}', extra: client),
    );
  }
}

/// Карточка клиента: контакты, теги, заметки + быстрый переход в чат.
class ClientDetailScreen extends StatelessWidget {
  const ClientDetailScreen({super.key, required this.client});
  final Client client;

  @override
  Widget build(BuildContext context) {
    final ColorScheme cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text(client.fullName.isNotEmpty ? client.fullName : 'Клиент')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          Row(
            children: <Widget>[
              CircleAvatar(
                radius: 28,
                backgroundColor: cs.primary.withValues(alpha: 0.18),
                child: Text(client.initials,
                    style: TextStyle(color: cs.primary, fontWeight: FontWeight.w800, fontSize: 20)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(client.fullName.isNotEmpty ? client.fullName : 'Без имени',
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text(
                      <String>[
                        client.isOnline ? 'Онлайн' : 'Очно',
                        client.status == ClientStatus.active ? 'активный' : 'в архиве',
                        if (!client.hasAccount) 'без аккаунта',
                      ].join(' · '),
                      style: TextStyle(color: cs.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          if (client.phone?.trim().isNotEmpty == true)
            _InfoRow(icon: Icons.phone_outlined, text: client.phone!.trim()),
          ...client.contacts.map((ClientContact c) =>
              _InfoRow(icon: Icons.alternate_email, text: '${c.type}: ${c.value}')),
          if (client.tags.isNotEmpty) ...<Widget>[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: client.tags
                  .map((String t) => Chip(
                        label: Text(t),
                        visualDensity: VisualDensity.compact,
                      ))
                  .toList(),
            ),
          ],
          if (client.notes?.trim().isNotEmpty == true) ...<Widget>[
            const SizedBox(height: 16),
            Text('Заметки', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 6),
            Text(client.notes!.trim(), style: const TextStyle(fontSize: 15)),
          ],
          const SizedBox(height: 28),
          FilledButton.icon(
            onPressed: () => context.push(
                '/chat/${client.id}?name=${Uri.encodeComponent(client.fullName)}'),
            icon: const Icon(Icons.chat_bubble_outline, size: 18),
            label: const Text('Открыть чат'),
            style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(48)),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, size: 18, color: Theme.of(context).colorScheme.onSurfaceVariant),
          const SizedBox(width: 12),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 15))),
        ],
      ),
    );
  }
}
