import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/onboarding_flag.dart';
import '../screens/onboarding_qr_screen.dart';

/// Гейт онбординга-QR: сразу после регистрации (флаг [onboardingPendingProvider])
/// поверх всего приложения один раз показываем экран с QR/ID для тренера. По
/// «Готово» флаг снимается — экран больше не появляется. Существующие
/// пользователи (логин) флага не имеют — видят обычное приложение. Ставится в
/// MaterialApp.builder ВНУТРИ BirthdayGate: сначала обязательный день рождения,
/// затем QR-онбординг.
class OnboardingGate extends ConsumerWidget {
  const OnboardingGate({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bool authed = ref.watch(sessionProvider).status == AuthStatus.authenticated;
    final bool pending = ref.watch(onboardingPendingProvider);
    if (authed && pending) {
      return OnboardingQrScreen(
        onDone: () => ref.read(onboardingPendingProvider.notifier).complete(),
      );
    }
    return child;
  }
}
