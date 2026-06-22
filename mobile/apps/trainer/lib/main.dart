import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'api/trainer_calendar.dart';
import 'api/trainer_chat.dart';
import 'api/trainer_home.dart';
import 'router.dart';

/// Наблюдатель data-провайдеров: при смене пользователя сбрасываем их кэш,
/// иначе после входа под другим аккаунтом видны данные предыдущего.
final UserScopeObserver _userScope = UserScopeObserver();

void main() {
  // Полный перехват ошибок Dart → журнал (файл crash.log + logcat APPCRASH).
  runGuarded(() async {
    // Тему грузим ДО первого кадра — иначе перескок light→dark на старте.
    // (Шрифты забандлены в ассеты core → грузятся синхронно, прогрев не нужен.)
    final ThemeMode themeMode = await loadThemeMode();
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
  // Неизвестный url — безопасный дефолт в список диалогов.
  router.go('/chats');
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
      routerConfig: router,
    );
  }
}
