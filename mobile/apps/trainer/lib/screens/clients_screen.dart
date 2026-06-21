import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/trainer_client_card.dart';
import '../api/trainer_clients.dart';
import 'assign_workout_screen.dart';
import 'client_edit_screen.dart';

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
      floatingActionButton: FloatingActionButton(
        onPressed: () => Navigator.of(context).push<bool>(
          MaterialPageRoute<bool>(builder: (_) => const ClientEditScreen()),
        ),
        child: const Icon(Icons.person_add_alt),
      ),
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
const List<String> _ruMonths = <String>[
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];
String _date(DateTime? d) => d == null ? '' : '${d.day} ${_ruMonths[d.month - 1]} ${d.year}';

class ClientDetailScreen extends ConsumerWidget {
  const ClientDetailScreen({super.key, required this.client});
  final Client client;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ColorScheme cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(client.fullName.isNotEmpty ? client.fullName : 'Клиент'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Редактировать',
            icon: const Icon(Icons.edit_outlined),
            onPressed: () async {
              final bool? changed = await Navigator.of(context).push<bool>(
                MaterialPageRoute<bool>(builder: (_) => ClientEditScreen(client: client)),
              );
              if (changed == true && context.mounted) {
                ref.invalidate(trainerClientsProvider);
                Navigator.of(context).pop();
              }
            },
          ),
        ],
      ),
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
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: () => context.push(
                '/chat/${client.id}?name=${Uri.encodeComponent(client.fullName)}'),
            icon: const Icon(Icons.chat_bubble_outline, size: 18),
            label: const Text('Открыть чат'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          ),
          const SizedBox(height: 20),
          _Section(title: 'Баланс', child: _PackagesBlock(clientId: client.id)),
          const SizedBox(height: 16),
          _Section(
            title: 'Замеры',
            action: _RequestMeasureButton(clientId: client.id),
            child: _MeasurementsBlock(clientId: client.id),
          ),
          const SizedBox(height: 16),
          _Section(
            title: 'Тренировки',
            action: _AssignButton(clientId: client.id, clientName: client.fullName),
            child: _WorkoutsBlock(clientId: client.id),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

/// Заголовок секции + опциональная кнопка действия справа.
class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child, this.action});
  final String title;
  final Widget child;
  final Widget? action;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          children: <Widget>[
            Text(title.toUpperCase(),
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.5, color: c.inkMutedXl)),
            const Spacer(),
            ?action,
          ],
        ),
        const SizedBox(height: 8),
        child,
      ],
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty(this.text);
  final String text;
  @override
  Widget build(BuildContext context) =>
      Text(text, style: TextStyle(fontSize: 13, color: context.colors.inkMuted));
}

class _PackagesBlock extends ConsumerWidget {
  const _PackagesBlock({required this.clientId});
  final String clientId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<List<TPackage>> pkgs = ref.watch(clientPackagesProvider(clientId));
    return pkgs.when(
      loading: () => const _Empty('Загрузка…'),
      error: (Object e, _) => const _Empty('Не удалось загрузить'),
      data: (List<TPackage> all) {
        final List<TPackage> active = all.where((TPackage p) => p.isActive).toList();
        if (active.isEmpty) return const _Empty('Активных пакетов нет');
        return Column(
          children: active.map((TPackage p) => Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
                child: Row(
                  children: <Widget>[
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(p.workoutType?.isNotEmpty == true ? p.workoutType! : 'Пакет',
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                          if (p.endsAt != null)
                            Text('до ${_date(DateTime.tryParse(p.endsAt!)?.toLocal())}',
                                style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: <Widget>[
                        Text('${p.remaining}',
                            style: AppFonts.display(size: 22, color: p.remaining > 0 ? c.accent : c.danger)),
                        Text('осталось', style: AppFonts.mono(size: 9, color: c.inkMutedXl, weight: FontWeight.w700)),
                      ],
                    ),
                  ],
                ),
              )).toList(),
        );
      },
    );
  }
}

class _MeasurementsBlock extends ConsumerWidget {
  const _MeasurementsBlock({required this.clientId});
  final String clientId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<List<TMeasurement>> ms = ref.watch(clientMeasurementsProvider(clientId));
    return ms.when(
      loading: () => const _Empty('Загрузка…'),
      error: (Object e, _) => const _Empty('Не удалось загрузить'),
      data: (List<TMeasurement> all) {
        if (all.isEmpty) return const _Empty('Замеров пока нет');
        final TMeasurement last = all.first;
        final List<String> chips = <String>[
          if (last.weightKg != null) '${last.weightKg} кг',
          if (last.bodyFatPct != null) '${last.bodyFatPct}% жира',
          ...last.metrics.entries.map((MapEntry<String, num> e) => '${e.key} ${e.value}'),
        ];
        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(_date(last.date), style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: chips
                    .map((String s) => Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(color: c.chip, borderRadius: BorderRadius.circular(10)),
                          child: Text(s, style: TextStyle(fontSize: 13, color: c.ink)),
                        ))
                    .toList(),
              ),
              if (all.length > 1) ...<Widget>[
                const SizedBox(height: 8),
                Text('Всего замеров: ${all.length}',
                    style: TextStyle(fontSize: 12, color: c.inkMutedXl)),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _RequestMeasureButton extends ConsumerWidget {
  const _RequestMeasureButton({required this.clientId});
  final String clientId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return TextButton.icon(
      onPressed: () async {
        final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
        try {
          await ref.read(trainerClientCardApiProvider).requestMeasurements(clientId, null);
          m.showSnackBar(const SnackBar(content: Text('Запрос на замеры отправлен')));
        } catch (_) {
          m.showSnackBar(const SnackBar(content: Text('Не удалось отправить запрос')));
        }
      },
      icon: const Icon(Icons.straighten, size: 16),
      label: const Text('Запросить'),
    );
  }
}

class _AssignButton extends ConsumerWidget {
  const _AssignButton({required this.clientId, required this.clientName});
  final String clientId;
  final String clientName;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return TextButton.icon(
      onPressed: () async {
        final bool? assigned = await Navigator.of(context).push<bool>(
          MaterialPageRoute<bool>(
            builder: (_) => AssignWorkoutScreen(clientId: clientId, clientName: clientName),
          ),
        );
        if (assigned == true) ref.invalidate(clientWorkoutsCardProvider(clientId));
      },
      icon: const Icon(Icons.add, size: 16),
      label: const Text('Назначить'),
    );
  }
}

class _WorkoutsBlock extends ConsumerWidget {
  const _WorkoutsBlock({required this.clientId});
  final String clientId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<List<TWorkout>> ws = ref.watch(clientWorkoutsCardProvider(clientId));
    return ws.when(
      loading: () => const _Empty('Загрузка…'),
      error: (Object e, _) => const _Empty('Не удалось загрузить'),
      data: (List<TWorkout> all) {
        final List<TWorkout> done = all.where((TWorkout w) => w.status == 'completed').take(10).toList();
        if (done.isEmpty) return const _Empty('Проведённых тренировок нет');
        return Column(
          children: done.map((TWorkout w) => Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
                child: Row(
                  children: <Widget>[
                    Icon(Icons.fitness_center, size: 18, color: c.inkMuted),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(w.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                          Text(
                            <String>[
                              if (w.completedAt != null) _date(w.completedAt),
                              '${w.exerciseCount} упр.',
                              if (w.createdByClient) 'своя',
                            ].join(' · '),
                            style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              )).toList(),
        );
      },
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
