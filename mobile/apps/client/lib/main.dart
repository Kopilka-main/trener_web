import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'router.dart';

void main() {
  runApp(
    ProviderScope(
      overrides: <Override>[
        baseUrlProvider.overrideWithValue('https://my.fitbond.ru'),
      ],
      child: const ClientApp(),
    ),
  );
}

/// Клиентское приложение Trener: фирменная тема, токен-сессия, роутер
/// вход → главная.
class ClientApp extends ConsumerStatefulWidget {
  const ClientApp({super.key});

  @override
  ConsumerState<ClientApp> createState() => _ClientAppState();
}

class _ClientAppState extends ConsumerState<ClientApp> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(sessionProvider.notifier).bootstrap();
    });
  }

  @override
  Widget build(BuildContext context) {
    final GoRouter router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Trener — клиент',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(AppAccents.client),
      routerConfig: router,
    );
  }
}
