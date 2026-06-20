import 'package:core/core.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'api/trainer_clients.dart';
import 'screens/calendar_screen.dart';
import 'screens/chat_screen.dart';
import 'screens/clients_screen.dart';
import 'screens/conversations_screen.dart';
import 'screens/home_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/login_screen.dart';
import 'screens/register_screen.dart';
import 'screens/splash_screen.dart';

/// Роутер с редиректом по статусу сессии: пока неизвестно → сплеш,
/// не авторизован → вход, авторизован → главная.
final Provider<GoRouter> routerProvider = Provider<GoRouter>((ref) {
  final ValueNotifier<int> refresh = ValueNotifier<int>(0);
  ref.listen<SessionState>(sessionProvider, (_, _) => refresh.value++);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: refresh,
    redirect: (BuildContext context, GoRouterState state) {
      final AuthStatus status = ref.read(sessionProvider).status;
      final String loc = state.matchedLocation;
      if (status == AuthStatus.unknown) return loc == '/splash' ? null : '/splash';
      if (status == AuthStatus.unauthenticated) {
        return (loc == '/login' || loc == '/register') ? null : '/login';
      }
      if (loc == '/login' || loc == '/register' || loc == '/splash') return '/home';
      return null;
    },
    routes: <RouteBase>[
      GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, _) => const RegisterScreen()),
      GoRoute(path: '/home', builder: (_, _) => const HomeScreen()),
      GoRoute(path: '/calendar', builder: (_, _) => const CalendarScreen()),
      GoRoute(path: '/settings', builder: (_, _) => const SettingsScreen()),
      GoRoute(path: '/clients', builder: (_, _) => const ClientsScreen()),
      GoRoute(
        path: '/client/:id',
        builder: (BuildContext context, GoRouterState state) {
          final Object? extra = state.extra;
          if (extra is Client) return ClientDetailScreen(client: extra);
          return const ClientsScreen();
        },
      ),
      GoRoute(path: '/chats', builder: (_, _) => const ConversationsScreen()),
      GoRoute(
        path: '/chat/:clientId',
        builder: (BuildContext context, GoRouterState state) => ChatScreen(
          clientId: state.pathParameters['clientId'] ?? '',
          clientName: state.uri.queryParameters['name'] ?? 'Клиент',
        ),
      ),
    ],
  );
});
