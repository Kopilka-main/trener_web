import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'analytics_hook.dart';
import 'api/client_calendar.dart';
import 'api/client_chat.dart';
import 'api/client_home.dart';
import 'api/client_packages.dart';
import 'api/client_workouts.dart';
import 'router.dart';
import 'widgets/birthday_gate.dart';
import 'widgets/onboarding_gate.dart';

/// Наблюдатель data-провайдеров: при смене пользователя сбрасываем их кэш,
/// иначе после входа под другим аккаунтом видны данные предыдущего.
final UserScopeObserver _userScope = UserScopeObserver();

void main() {
  // Полный перехват ошибок Dart → журнал (файл crash.log + logcat APPCRASH).
  runGuarded(() async {
    // Тему грузим ДО первого кадра — иначе перескок light→dark на старте.
    // (Шрифты забандлены в ассеты core → грузятся синхронно, прогрев не нужен.)
    final ThemeMode themeMode = await loadThemeMode();
    // Только книжная (портретная) ориентация — приложение не поворачивается.
    await SystemChrome.setPreferredOrientations(<DeviceOrientation>[
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);
    runApp(
      ProviderScope(
        observers: <ProviderObserver>[_userScope],
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

/// Пуш пришёл/открыт — сбрасываем кэш ключевых данных, чтобы экран сразу показал
/// свежее (чат, тренировки, занятия, главная, счётчик непрочитанных), а не догонял
/// через пару секунд поллингом.
void _refreshForPush(WidgetRef ref) {
  ref.invalidate(clientChatProvider);
  ref.invalidate(clientWorkoutsProvider);
  ref.invalidate(clientSessionsProvider);
  ref.invalidate(clientHomeProvider);
  ref.invalidate(clientUnreadProvider);
}

/// Клиентское приложение Trener: фирменная тема, токен-сессия, роутер
/// вход → главная.
class ClientApp extends ConsumerStatefulWidget {
  const ClientApp({super.key});

  @override
  ConsumerState<ClientApp> createState() => _ClientAppState();
}

class _ClientAppState extends ConsumerState<ClientApp> {
  ScreenAnalytics? _analytics;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(sessionProvider.notifier).bootstrap();
      // Лог экранов (аналитика): один на приложение, слушает смену маршрута.
      _analytics = ScreenAnalytics(ref)..start();
    });
  }

  @override
  void dispose() {
    _analytics?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final GoRouter router = ref.watch(routerProvider);
    ref.listen<SessionState>(sessionProvider, (SessionState? prev, SessionState next) {
      // Смена токена (вход/выход/смена аккаунта) → сбросить кэш данных прошлого
      // пользователя, иначе показываются чужие данные. Холодный старт
      // (unknown→authenticated) пропускаем — там кэшировать ещё нечего.
      if (prev != null && prev.status != AuthStatus.unknown && next.token != prev.token) {
        resetUserScopedData(ref, _userScope);
      }
      // При входе — инициализируем пуши (один раз на переход в authenticated).
      if (next.status == AuthStatus.authenticated &&
          prev?.status != AuthStatus.authenticated) {
        ref.read(pushServiceProvider).init(
              // Пуш при активном приложении — обновляем данные, экран не отстаёт.
              onForeground: (String? url) => _refreshForPush(ref),
              // Тап по пушу — сперва освежаем данные, затем переходим на экран.
              onTap: (String? url) {
                _refreshForPush(ref);
                _openFromPush(router, url);
              },
            );
      }
    });
    return MaterialApp.router(
      title: 'Trener — клиент',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(AppColors.light),
      darkTheme: buildAppTheme(AppColors.dark),
      themeMode: ref.watch(themeModeProvider),
      builder: (BuildContext context, Widget? child) => BirthdayGate(
        child: OnboardingGate(child: child ?? const SizedBox.shrink()),
      ),
      routerConfig: router,
    );
  }
}
