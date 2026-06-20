import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/trainer_auth.dart';
import '../api/trainer_home.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<HomeData> home = ref.watch(trainerHomeProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Главная'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Выйти',
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(trainerApiProvider).logout(),
          ),
        ],
      ),
      body: home.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Text('Не удалось загрузить главную'),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => ref.invalidate(trainerHomeProvider),
                child: const Text('Повторить'),
              ),
            ],
          ),
        ),
        data: (HomeData d) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(trainerHomeProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: <Widget>[
              Text(d.name, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              _Hero(value: d.todaySessions),
              const SizedBox(height: 20),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.5,
                children: <Widget>[
                  _Tile(title: 'Клиенты', value: d.activeClients, sub: 'активных', icon: Icons.group_outlined),
                  _Tile(
                    title: 'Календарь',
                    value: d.plannedSessions,
                    sub: 'на 30 дней',
                    icon: Icons.calendar_today,
                    onTap: () => context.push('/calendar'),
                  ),
                  _Tile(
                    title: 'Чат',
                    value: d.unread,
                    sub: 'новых',
                    icon: Icons.chat_bubble_outline,
                    onTap: () => context.push('/chats'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.value});
  final int value;

  @override
  Widget build(BuildContext context) {
    final Color accent = Theme.of(context).colorScheme.primary;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        Text(
          value.toString().padLeft(2, '0'),
          style: TextStyle(fontSize: 64, height: 1, fontWeight: FontWeight.w800, color: accent),
        ),
        const SizedBox(width: 12),
        const Text(
          'тренировок\nсегодня',
          style: TextStyle(fontSize: 20, height: 1.1, fontWeight: FontWeight.bold),
        ),
      ],
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.title,
    required this.value,
    required this.sub,
    required this.icon,
    this.onTap,
  });
  final String title;
  final int value;
  final String sub;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: <Widget>[
            Icon(icon, size: 20),
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: <Widget>[
                Text(value.toString().padLeft(2, '0'),
                    style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
                const SizedBox(width: 6),
                Text(sub, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
            Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        ),
      ),
    );
  }
}
