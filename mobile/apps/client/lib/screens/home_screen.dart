import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/client_auth.dart';
import '../api/client_home.dart';

const List<String> _ruMonths = <String>[
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

String _formatRuDate(String iso) {
  final List<String> p = iso.substring(0, 10).split('-');
  if (p.length != 3) return iso;
  final int m = int.tryParse(p[1]) ?? 1;
  return '${int.tryParse(p[2]) ?? p[2]} ${_ruMonths[(m - 1).clamp(0, 11)]} ${p[0]}';
}

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<HomeData> home = ref.watch(clientHomeProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Главная'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Подключиться к тренеру',
            icon: const Icon(Icons.person_add_alt),
            onPressed: () => context.push('/connect'),
          ),
          IconButton(
            tooltip: 'Выйти',
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(clientApiProvider).logout(),
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
                onPressed: () => ref.invalidate(clientHomeProvider),
                child: const Text('Повторить'),
              ),
            ],
          ),
        ),
        data: (HomeData d) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(clientHomeProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: <Widget>[
              Text(d.name, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              _Hero(value: d.paidBalance, endsAt: d.packageEndsAt),
              const SizedBox(height: 20),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.5,
                children: <Widget>[
                  _Tile(title: 'Тренировки', value: d.completedWorkouts, sub: 'завершено', icon: Icons.fitness_center),
                  _Tile(
                    title: 'Календарь',
                    value: d.plannedSessions,
                    sub: 'на 30 дней',
                    icon: Icons.calendar_today,
                    onTap: () => context.push('/calendar'),
                  ),
                  _Tile(title: 'Чат', value: d.unread, sub: 'новых', icon: Icons.chat_bubble_outline),
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
  const _Hero({required this.value, required this.endsAt});
  final int value;
  final String? endsAt;

  @override
  Widget build(BuildContext context) {
    final Color accent = Theme.of(context).colorScheme.primary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: <Widget>[
            Text(
              value < 0 ? '$value' : value.toString().padLeft(2, '0'),
              style: TextStyle(fontSize: 64, height: 1, fontWeight: FontWeight.w800, color: accent),
            ),
            const SizedBox(width: 12),
            const Text(
              'количество\nтренировок',
              style: TextStyle(fontSize: 20, height: 1.1, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        if (endsAt != null) ...<Widget>[
          const SizedBox(height: 6),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(Icons.local_fire_department, size: 16, color: accent),
              const SizedBox(width: 4),
              Text('до ${_formatRuDate(endsAt!)}',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Theme.of(context).colorScheme.onSurfaceVariant)),
            ],
          ),
        ],
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
