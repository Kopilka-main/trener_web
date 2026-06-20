import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client_auth.dart';

/// Подключение к тренеру: клиент показывает свой код (id аккаунта) и передаёт
/// тренеру — тот привязывает клиента у себя.
class ConnectScreen extends ConsumerWidget {
  const ConnectScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<ClientAccount> me = ref.watch(clientMeProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Подключение к тренеру')),
      body: me.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => const Center(child: Text('Не удалось загрузить код')),
        data: (ClientAccount acc) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                const Text(
                  'Передайте этот код тренеру — он подключит вас.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                SelectableText(
                  acc.id,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, letterSpacing: 0.5),
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  icon: const Icon(Icons.copy, size: 18),
                  label: const Text('Скопировать код'),
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: acc.id));
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Код скопирован')),
                      );
                    }
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
