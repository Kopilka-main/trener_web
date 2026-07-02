import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/active_workout_state.dart';
import '../router.dart';

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
  static const double _w = 208;
  static const double _h = 56;
  Offset? _pos; // null → позиция по умолчанию (справа снизу)

  GoRouter? _router;
  String _location = '/';

  @override
  void initState() {
    super.initState();
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
    _router?.routerDelegate.removeListener(_onRouteChange);
    super.dispose();
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
    return Stack(
      children: <Widget>[
        widget.child,
        if (authed && aw != null && !onActiveScreen) _fab(context, aw),
      ],
    );
  }

  Widget _fab(BuildContext context, ActiveWorkoutRef aw) {
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
        onTap: () => ref.read(routerProvider).push('/active/${aw.clientId}/${aw.workoutId}'),
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
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text('Идёт тренировка',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w700, color: c.accentOn)),
                      Text(aw.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 11, color: c.accentOn.withValues(alpha: 0.8))),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right, size: 20, color: c.accentOn),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
