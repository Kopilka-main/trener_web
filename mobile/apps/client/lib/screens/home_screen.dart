import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client_auth.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<ClientAccount> me = ref.watch(clientMeProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Trener · клиент'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Выйти',
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(clientApiProvider).logout(),
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
                  onPressed: () => ref.invalidate(clientMeProvider),
                  child: const Text('Повторить'),
                ),
              ],
            ),
          ),
        ),
        data: (ClientAccount acc) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text('Привет,', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(
                acc.fullName.isEmpty ? acc.email : acc.fullName,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
