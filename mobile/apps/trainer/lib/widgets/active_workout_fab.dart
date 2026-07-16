import 'dart:async';

import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/active_workout_state.dart';
import '../api/offline_providers.dart';
import '../api/trainer_workouts.dart';
import '../router.dart';
import '../screens/active_workout_screen.dart';

/// Оверлей поверх всего приложения: если идёт (незавершённая) тренировка и мы не
/// на экране её проведения — рисуем перетаскиваемый плавающий бейдж «Идёт
/// тренировка». Тап → возврат к проведению. Ставится в MaterialApp.builder.
class ActiveWorkoutFab extends ConsumerStatefulWidget {
  const ActiveWorkoutFab({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<ActiveWorkoutFab> createState() => _ActiveWorkoutFabState();
}

class _ActiveWorkoutFabState extends ConsumerState<ActiveWorkoutFab> {
  static const double _w = 190;
  static const double _h = 56;
  Offset? _pos; // null → позиция по умолчанию (справа снизу)

  GoRouter? _router;
  String _location = '/';
  Timer? _tick; // раз в секунду обновляет таймер тренировки на бейдже

  @override
  void initState() {
    super.initState();
    // Тикаем, пока идёт тренировка, чтобы таймер на бейдже шёл.
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && ref.read(activeWorkoutProvider) != null) setState(() {});
    });
    // «Мы на экране проведения?» определяем по текущему маршруту роутера, а не
    // по ручному флагу — тот застревал при навигации вперёд (go_router держит
    // экран в стеке, dispose не вызывается) и FAB пропадал до перезапуска.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _router = ref.read(routerProvider);
      _router!.routerDelegate.addListener(_onRouteChange);
      _onRouteChange();
    });
  }

  void _onRouteChange() {
    if (!mounted) return;
    final String loc = _router?.routerDelegate.currentConfiguration.uri.path ?? '/';
    if (loc != _location) setState(() => _location = loc);
  }

  @override
  void dispose() {
    _tick?.cancel();
    _router?.routerDelegate.removeListener(_onRouteChange);
    super.dispose();
  }

  /// Длительность «M:SS» (или «H:MM:SS» от часа).
  String _fmt(int totalSec) {
    final int s = totalSec % 60;
    final int m = (totalSec ~/ 60) % 60;
    final int h = totalSec ~/ 3600;
    String two(int n) => n.toString().padLeft(2, '0');
    return h > 0 ? '$h:${two(m)}:${two(s)}' : '$m:${two(s)}';
  }

  @override
  Widget build(BuildContext context) {
    final bool authed = ref.watch(sessionProvider).status == AuthStatus.authenticated;
    final ActiveWorkoutRef? aw = ref.watch(activeWorkoutProvider);
    // Экран проведения открывается двумя путями: go_router (`/active/...` из
    // самого FAB) и Navigator.push(MaterialPageRoute) (с главной/карточки/
    // календаря — маршрут роутера при этом НЕ меняется). Прячем FAB, если
    // сработал любой признак: активный маршрут ИЛИ флаг «экран смонтирован».
    final bool onActiveScreen =
        _location.startsWith('/active/') || ref.watch(activeWorkoutOnScreenProvider);
    final bool show = authed && aw != null && !onActiveScreen;
    // На бейдже — ТАЙМЕР идущей тренировки (не имя клиента). startedAt берём из
    // самой тренировки: серверной — из кэша провайдера, локальной — из
    // локального документа (без сети). Тикер выше обновляет раз в секунду.
    String label = '';
    if (show) {
      final DateTime? started;
      if (aw.local) {
        started = ref.watch(localWorkoutByIdProvider(aw.workoutId)).valueOrNull?.startedAt;
      } else {
        final Workout? wk =
            ref.watch(trainerWorkoutProvider((clientId: aw.clientId, wid: aw.workoutId))).valueOrNull;
        started = wk?.startedAt;
      }
      final int sec =
          started != null ? DateTime.now().difference(started).inSeconds.clamp(0, 1 << 30) : 0;
      label = _fmt(sec);
    }
    return Stack(
      children: <Widget>[
        widget.child,
        if (show) _fab(context, aw, label),
      ],
    );
  }

  Widget _fab(BuildContext context, ActiveWorkoutRef aw, String label) {
    final AppColors c = context.colors;
    final Size size = MediaQuery.of(context).size;
    final EdgeInsets pad = MediaQuery.of(context).padding;
    final Offset def = Offset(size.width - _w - 16, size.height - _h - pad.bottom - 96);
    final Offset raw = _pos ?? def;
    final double left = raw.dx.clamp(8, size.width - _w - 8);
    final double top = raw.dy.clamp(pad.top + 8, size.height - _h - pad.bottom - 8);
    return Positioned(
      left: left,
      top: top,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onPanUpdate: (DragUpdateDetails d) =>
            setState(() => _pos = Offset(left + d.delta.dx, top + d.delta.dy)),
        onTap: () {
          if (aw.local) {
            // Локальная тренировка не живёт на маршруте `/active/...` (тот
            // только для серверной) — открываем поверх всего через корневой
            // навигатор, как это делает список клиента при «продолжить».
            ref.read(routerProvider).routerDelegate.navigatorKey.currentState?.push(
                  MaterialPageRoute<void>(
                    builder: (_) => ActiveWorkoutScreen.local(localWorkoutId: aw.workoutId),
                  ),
                );
            return;
          }
          // Сбрасываем кэш тренировки, чтобы экран проведения открылся со СВЕЖИМ
          // статусом (active), а не устаревшим черновиком (draft) из кэша.
          ref.invalidate(trainerWorkoutProvider((clientId: aw.clientId, wid: aw.workoutId)));
          ref.read(routerProvider).push('/active/${aw.clientId}/${aw.workoutId}');
        },
        child: Material(
          color: Colors.transparent,
          child: Container(
            width: _w,
            height: _h,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: c.accent,
              borderRadius: BorderRadius.circular(_h / 2),
              boxShadow: <BoxShadow>[
                BoxShadow(
                    color: Colors.black.withValues(alpha: 0.25),
                    blurRadius: 12,
                    offset: const Offset(0, 4)),
              ],
            ),
            child: Row(
              children: <Widget>[
                Icon(Icons.fitness_center, size: 20, color: c.accentOn),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.accentOn)),
                ),
                Icon(Icons.chevron_right, size: 18, color: c.accentOn),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
