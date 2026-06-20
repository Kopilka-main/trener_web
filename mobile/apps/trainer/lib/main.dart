import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'router.dart';

void main() {
  runApp(
    ProviderScope(
      overrides: <Override>[
        baseUrlProvider.overrideWithValue('https://app.fitbond.ru'),
      ],
      child: const TrainerApp(),
    ),
  );
}

/// Тренерское приложение Trener: фирменная тема, токен-сессия, роутер
/// вход → главная.
class TrainerApp extends ConsumerStatefulWidget {
  const TrainerApp({super.key});

  @override
  ConsumerState<TrainerApp> createState() => _TrainerAppState();
}

class _TrainerAppState extends ConsumerState<TrainerApp> {
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
      title: 'Trener — тренер',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(AppAccents.trainer),
      routerConfig: router,
    );
  }
}
