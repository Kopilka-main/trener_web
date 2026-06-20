import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_auth.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<TrainerProfile> me = ref.watch(trainerMeProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Trener · тренер'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Выйти',
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(trainerApiProvider).logout(),
          ),
        ],
      ),
      body: me.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                const Text('Не удалось загрузить профиль'),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => ref.invalidate(trainerMeProvider),
                  child: const Text('Повторить'),
                ),
              ],
            ),
          ),
        ),
        data: (TrainerProfile t) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text('Привет,', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(
                t.fullName.isEmpty ? t.email : t.fullName,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
