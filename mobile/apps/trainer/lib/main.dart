import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'analytics_hook.dart';
import 'api/trainer_calendar.dart';
import 'api/trainer_chat.dart';
import 'api/trainer_home.dart';
import 'router.dart';
import 'widgets/active_workout_fab.dart';
import 'widgets/birthday_gate.dart';
import 'widgets/dev_report_fab.dart';
import 'widgets/nav_bar.dart';
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
          baseUrlProvider.overrideWithValue('https://app.fitbond.ru'),
          pushRegisterPathProvider.overrideWithValue('/api/push/device'),
          initialThemeModeProvider.overrideWithValue(themeMode),
        ],
        child: const TrainerApp(),
      ),
    );
  });
}

/// Маппинг url из пуша в маршрут тренера. Бэк шлёт разные url под тип события:
///   `/clients/<id>/chat`     — новое сообщение клиента → тред с клиентом;
///   `/clients/<id>/calendar` — клиент подтвердил/отклонил занятие → календарь.
void _openFromPush(GoRouter router, String? url) {
  if (url == null || url.isEmpty) return;
  final String path = url.split('?').first;
  final RegExpMatch? chat = RegExp(r'/clients/([^/]+)/chat').firstMatch(path);
  if (chat != null) {
    router.go('/chats');
    router.push('/chat/${chat.group(1)}');
    return;
  }
  if (RegExp(r'/clients/([^/]+)/calendar').hasMatch(path)) {
    router.go('/calendar');
    return;
  }
  // «Голый» /clients/<id> (клиент привязан / добавил фото или замер / платёж) —
  // открываем карточку этого клиента (грузится по id в маршруте /client/:id).
  final RegExpMatch? card = RegExp(r'^/clients/([^/]+)/?$').firstMatch(path);
  if (card != null) {
    router.go('/clients');
    router.push('/client/${card.group(1)}');
    return;
  }
  // Неизвестный url — безопасный дефолт в список диалогов.
  router.go('/chats');
}

/// Deep-link привязки клиента по QR: `https://app.fitbond.ru/link/<accountId>`.
/// Извлекаем код (последний сегмент пути или `?code=`) и уводим на `/link/<code>`.
/// Если пришло до авторизации — redirect роутера запомнит код и вернёт после входа.
void _openFromLink(GoRouter router, Uri uri) {
  if (uri.host != 'app.fitbond.ru') return;
  final List<String> segs = uri.pathSegments.where((String s) => s.isNotEmpty).toList();
  if (segs.isEmpty || segs.first != 'link') return;
  final String code =
      uri.queryParameters['code'] ?? (segs.length > 1 ? segs.last : '');
  if (code.isEmpty) return;
  router.go('/link/$code');
}

/// Пуш пришёл/открыт — сбрасываем кэш ключевых данных, чтобы экран сразу показал
/// свежее (диалоги, чат-тред, занятия, главная/бейджи), а не догонял через пару
/// секунд поллингом.
void _refreshForPush(WidgetRef ref) {
  ref.invalidate(trainerConversationsProvider);
  ref.invalidate(trainerChatMessagesProvider); // вся семья тредов
  ref.invalidate(trainerSessionsProvider);
  ref.invalidate(trainerHomeProvider);
}

/// Тренерское приложение Trener: фирменная тема, токен-сессия, роутер
/// вход → главная.
class TrainerApp extends ConsumerStatefulWidget {
  const TrainerApp({super.key});

  @override
  ConsumerState<TrainerApp> createState() => _TrainerAppState();
}

class _TrainerAppState extends ConsumerState<TrainerApp> {
  final AppLinks _appLinks = AppLinks();
  StreamSubscription<Uri>? _linkSub;
  ScreenAnalytics? _analytics;
  // Системный «назад» не закрывает приложение: обычный pop (с учётом PopScope
  // экранов), а на корне стека — уход на главную вместо выхода.
  late final BackButtonDispatcher _backDispatcher =
      _NoCloseBackDispatcher(ref.read(routerProvider));

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(sessionProvider.notifier).bootstrap();
      _initDeepLinks();
      // Лог экранов (аналитика): один на приложение, слушает смену маршрута.
      _analytics = ScreenAnalytics(ref)..start();
      _checkAppUpdate();
    });
  }

  /// Server-driven проверка «требуется обновление»: тянем /api/app-info и, если
  /// номер сборки ниже minBuild, показываем неигнорируемый диалог. Ошибки молчим.
  Future<void> _checkAppUpdate() async {
    try {
      final Map<String, dynamic> data = await ref.read(apiClientProvider).getJson('/api/app-info');
      final Map<String, dynamic>? e = data['trainer'] as Map<String, dynamic>?;
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

  /// Подписка на deep-link/app-link привязки клиента по QR:
  ///   • `getInitialLink()` — приложение открыто по ссылке из закрытого состояния;
  ///   • `uriLinkStream` — ссылка пришла, когда приложение уже запущено.
  /// Логику пушей не трогаем — это отдельный источник навигации.
  Future<void> _initDeepLinks() async {
    final GoRouter router = ref.read(routerProvider);
    try {
      final Uri? initial = await _appLinks.getInitialLink();
      if (initial != null) _openFromLink(router, initial);
    } catch (_) {
      // Плагин недоступен/битая ссылка — не мешаем старту.
    }
    _linkSub = _appLinks.uriLinkStream.listen(
      (Uri uri) => _openFromLink(ref.read(routerProvider), uri),
      onError: (_) {},
    );
  }

  @override
  void dispose() {
    _analytics?.dispose();
    _linkSub?.cancel();
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
      title: 'Trener — тренер',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(AppColors.light),
      darkTheme: buildAppTheme(AppColors.dark),
      themeMode: ref.watch(themeModeProvider),
      locale: const Locale('ru'),
      supportedLocales: const <Locale>[Locale('ru'), Locale('en')],
      localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      // Нижнее меню навигации (GlobalNavBar) — часть layout снизу, стоит ВНУТРИ
      // гейтов (онбординг его перекрывает) и снаружи DevReportFab (его кнопка —
      // над контентом, но выше панели). ActiveWorkoutFab (badge «идёт
      // тренировка») — оверлей поверх всего.
      builder: (BuildContext context, Widget? child) => ActiveWorkoutFab(
        child: BirthdayGate(
          child: OnboardingGate(
            child: GlobalNavBar(
              child: DevReportFab(child: child ?? const SizedBox.shrink()),
            ),
          ),
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
