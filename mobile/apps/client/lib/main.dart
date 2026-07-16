import 'dart:async';

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
import 'widgets/dev_report_fab.dart';
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

class _ClientAppState extends ConsumerState<ClientApp> with WidgetsBindingObserver {
  ScreenAnalytics? _analytics;
  // Глобальный автоопрос ленты, пока приложение на переднем плане (вебсокетов
  // нет): держит главную/уведомления свежими без перезапуска.
  Timer? _feedPoll;
  // Системный «назад» не закрывает приложение: обычный pop (с учётом PopScope
  // экранов), а на корне стека — уход на главную вместо выхода.
  late final BackButtonDispatcher _backDispatcher =
      _NoCloseBackDispatcher(ref.read(routerProvider));

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(sessionProvider.notifier).bootstrap();
      // Лог экранов (аналитика): один на приложение, слушает смену маршрута.
      _analytics = ScreenAnalytics(ref)..start();
      _checkAppUpdate();
    });
    _startFeedPoll();
  }

  /// Регулярный автоопрос источников ленты (занятия/тренировки/чат/пакеты/
  /// главная/непрочитанные), пока приложение на переднем плане. Без него новые
  /// уведомления (напр. занятие на согласование) появлялись только после
  /// перезапуска — как поллинг в тренерском приложении, но общий на всё приложение.
  void _startFeedPoll() {
    _feedPoll?.cancel();
    _feedPoll = Timer.periodic(const Duration(seconds: 25), (_) => _refreshFeed());
  }

  void _refreshFeed() {
    if (!mounted) return;
    if (ref.read(sessionProvider).status != AuthStatus.authenticated) return;
    ref.invalidate(clientSessionsProvider);
    ref.invalidate(clientWorkoutsProvider);
    ref.invalidate(clientChatProvider);
    ref.invalidate(clientUnreadProvider);
    ref.invalidate(clientPackagesProvider);
    ref.invalidate(clientHomeProvider);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _refreshFeed(); // вернулись в приложение → сразу освежить, потом по таймеру
      _startFeedPoll();
    } else if (state == AppLifecycleState.paused) {
      _feedPoll?.cancel(); // в фоне сервер не опрашиваем
    }
  }

  /// Server-driven проверка «требуется обновление»: тянем /api/app-info и, если
  /// номер сборки ниже minBuild, показываем неигнорируемый диалог. Ошибки молчим.
  Future<void> _checkAppUpdate() async {
    try {
      final Map<String, dynamic> data = await ref.read(apiClientProvider).getJson('/api/app-info');
      final Map<String, dynamic>? e = data['client'] as Map<String, dynamic>?;
      if (e == null) return;
      final BuildContext? ctx = ref.read(routerProvider).routerDelegate.navigatorKey.currentContext;
      if (ctx == null || !ctx.mounted) return;
      await maybeForceUpdate(
        ctx,
        minBuild: (e['minBuild'] as num?)?.toInt() ?? 0,
        androidUrl: e['android'] as String? ?? '',
        iosUrl: e['ios'] as String? ?? '',
      );
    } catch (_) {
      // сеть/парсинг недоступны — не блокируем запуск
    }
  }

  @override
  void dispose() {
    _feedPoll?.cancel();
    WidgetsBinding.instance.removeObserver(this);
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
      title: 'FitFlow me',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(AppColors.light),
      darkTheme: buildAppTheme(AppColors.dark),
      themeMode: ref.watch(themeModeProvider),
      builder: (BuildContext context, Widget? child) => BirthdayGate(
        child: OnboardingGate(
          child: DevReportFab(child: child ?? const SizedBox.shrink()),
        ),
      ),
      // routerConfig разложен на части, чтобы подставить свой BackButtonDispatcher
      // (см. _backDispatcher): системный «назад» не закрывает приложение.
      routeInformationProvider: router.routeInformationProvider,
      routeInformationParser: router.routeInformationParser,
      routerDelegate: router.routerDelegate,
      backButtonDispatcher: _backDispatcher,
    );
  }
}

/// Диспетчер системной кнопки/жеста «назад», который НИКОГДА не закрывает
/// приложение. Обычная обработка (pop с учётом [PopScope] экранов) идёт через
/// super; если popать нечего (корень стека) — уводим на главную (если не на ней)
/// и сообщаем системе, что «назад» обработан, поэтому выхода не происходит.
class _NoCloseBackDispatcher extends RootBackButtonDispatcher {
  _NoCloseBackDispatcher(this._router);
  final GoRouter _router;

  @override
  Future<bool> didPopRoute() async {
    final bool handled = await super.didPopRoute();
    if (handled) return true;
    if (_router.routerDelegate.currentConfiguration.uri.path != '/home') {
      _router.go('/home');
    }
    return true;
  }
}
