import 'package:core/core.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'screens/calendar_screen.dart';
import 'screens/chat_screen.dart';
import 'screens/connect_screen.dart';
import 'screens/home_screen.dart';
import 'screens/knowledge_screen.dart';
import 'screens/login_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/progress_screen.dart';
import 'screens/register_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/splash_screen.dart';
import 'screens/workouts_screen.dart';
import 'api/client_workouts.dart';

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
      GoRoute(path: '/chat', builder: (_, _) => const ChatScreen()),
      GoRoute(path: '/workouts', builder: (_, _) => const WorkoutsScreen()),
      GoRoute(
        path: '/workout/:id',
        builder: (BuildContext context, GoRouterState state) {
          final Object? extra = state.extra;
          if (extra is Workout) return WorkoutDetailScreen(workout: extra);
          // Прямой переход без объекта (например, deep link) — вернёмся к списку.
          return const WorkoutsScreen();
        },
      ),
      GoRoute(path: '/connect', builder: (_, _) => const ConnectScreen()),
      GoRoute(path: '/settings', builder: (_, _) => const SettingsScreen()),
      GoRoute(path: '/progress', builder: (_, _) => const ProgressScreen()),
      GoRoute(path: '/knowledge', builder: (_, _) => const KnowledgeScreen()),
      GoRoute(path: '/notifications', builder: (_, _) => const NotificationsScreen()),
    ],
  );
});
