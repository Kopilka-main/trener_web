import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'router.dart';

void main() {
  // Полный перехват ошибок Dart → журнал (файл crash.log + logcat APPCRASH).
  runGuarded(() async {
    // Тему грузим ДО первого кадра — иначе перескок light→dark на старте.
    // (Шрифты забандлены в ассеты core → грузятся синхронно, прогрев не нужен.)
    final ThemeMode themeMode = await loadThemeMode();
    runApp(
      ProviderScope(
        overrides: <Override>[
          baseUrlProvider.overrideWithValue('https://my.fitbond.ru'),
          pushRegisterPathProvider.overrideWithValue('/api/client/push/device'),
          initialThemeModeProvider.overrideWithValue(themeMode),
        ],
        child: const ClientApp(),
      ),
    );
  });
}

/// Маппинг url из пуша в маршрут клиента. Бэк шлёт разные url под тип события:
///   `/chat`          — новое сообщение тренера;
///   `/workouts`      — тренер назначил тренировку;
///   `/calendar`      — тренер создал занятие на согласование;
///   `/notifications` — запрос замеров / задача.
/// Url из пуша совпадает с путём роутера — ведём прямо туда, иначе в чат.
void _openFromPush(GoRouter router, String? url) {
  if (url == null || url.isEmpty) return;
  const Set<String> known = <String>{'/chat', '/workouts', '/calendar', '/notifications'};
  final String path = url.split('?').first;
  router.go(known.contains(path) ? path : '/chat');
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
    // При входе — инициализируем пуши (один раз на переход в authenticated).
    ref.listen<SessionState>(sessionProvider, (SessionState? prev, SessionState next) {
      if (next.status == AuthStatus.authenticated &&
          prev?.status != AuthStatus.authenticated) {
        ref.read(pushServiceProvider).init(onTap: (String? url) => _openFromPush(router, url));
      }
    });
    return MaterialApp.router(
      title: 'Trener — клиент',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(AppColors.light),
      darkTheme: buildAppTheme(AppColors.dark),
      themeMode: ref.watch(themeModeProvider),
      routerConfig: router,
    );
  }
}
