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
        pushRegisterPathProvider.overrideWithValue('/api/push/device'),
      ],
      child: const TrainerApp(),
    ),
  );
}

/// Маппинг url из пуша в маршрут тренера. Бэк шлёт `/clients/<id>/chat` при
/// новом сообщении от клиента — открываем соответствующий тред.
void _openFromPush(GoRouter router, String? url) {
  if (url == null || url.isEmpty) return;
  final RegExpMatch? m = RegExp(r'/clients/([^/]+)/chat').firstMatch(url);
  if (m != null) {
    router.go('/chats');
    router.push('/chat/${m.group(1)}');
  } else {
    router.go('/chats');
  }
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
    // При входе — инициализируем пуши (один раз на переход в authenticated).
    ref.listen<SessionState>(sessionProvider, (SessionState? prev, SessionState next) {
      if (next.status == AuthStatus.authenticated &&
          prev?.status != AuthStatus.authenticated) {
        ref.read(pushServiceProvider).init(onTap: (String? url) => _openFromPush(router, url));
      }
    });
    return MaterialApp.router(
      title: 'Trener — тренер',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(AppColors.light),
      darkTheme: buildAppTheme(AppColors.dark),
      themeMode: ref.watch(themeModeProvider),
      routerConfig: router,
    );
  }
}
