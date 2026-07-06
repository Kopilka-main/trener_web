import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/onboarding_flag.dart';
import '../screens/onboarding_screen.dart';

/// Гейт приветственной карусели. Если тренер авторизован и стоит флаг pending
/// (поднимается один раз при регистрации) — поверх всего приложения показываем
/// онбординг. Существующие пользователи (просто логин) флаг не имеют — карусель
/// не видят. Ставится в MaterialApp.builder ВНУТРИ BirthdayGate: сначала
/// обязательный день рождения, затем онбординг.
class OnboardingGate extends ConsumerWidget {
  const OnboardingGate({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bool authed = ref.watch(sessionProvider).status == AuthStatus.authenticated;
    final bool pending = ref.watch(onboardingPendingProvider);
    if (authed && pending) {
      return OnboardingScreen(
        onDone: () => ref.read(onboardingPendingProvider.notifier).complete(),
      );
    }
    return child;
  }
}
