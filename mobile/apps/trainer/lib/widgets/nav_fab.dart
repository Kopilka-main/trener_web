import 'package:core/core.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/active_workout_state.dart';
import '../router.dart';

/// Можно ли вернуться назад = в стеке корневого навигатора больше одного экрана.
/// go_router-location для этого негоден: при imperative `push`/`MaterialPageRoute`
/// он остаётся «/home». Наблюдатель ниже ловит ОБА вида переходов (они в одном
/// Navigator) и держит этот флаг актуальным.
final ValueNotifier<bool> navCanGoBack = ValueNotifier<bool>(false);

/// Наблюдатель стека — вешается в GoRouter(observers: [...]). Спрашивает сам
/// навигатор `canPop()` (есть ли под текущим экраном ещё маршруты) — надёжнее
/// ручного счётчика (тот промахивается на начальных push до подписки). Сверку
/// откладываем на кадр, чтобы состояние навигатора успело устаканиться.
class NavStackObserver extends NavigatorObserver {
  void _sync() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      navCanGoBack.value = navigator?.canPop() ?? false;
    });
  }

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) => _sync();
  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) => _sync();
  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) => _sync();
  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) => _sync();
}

/// Глобальная навигационная FAB-кнопка (замена нижнего меню). Стоит у ЛЕВОГО
/// края, перетаскивается вдоль него по вертикали. Тап — раскрывает меню переходов
/// (Назад / Главная / Календарь / Финансы) вверх; тап по затемнению — закрыть.
/// Ставится в MaterialApp.builder.
class GlobalNavFab extends ConsumerStatefulWidget {
  const GlobalNavFab({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<GlobalNavFab> createState() => _GlobalNavFabState();
}

class _GlobalNavFabState extends ConsumerState<GlobalNavFab> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 220));
  bool _open = false;
  double? _top; // позиция кнопки по вертикали (null → по умолчанию снизу)

  static const double _fabSize = 56;
  static const double _gap = 62; // шаг между пунктами меню

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _toggle() {
    setState(() => _open = !_open);
    _open ? _c.forward() : _c.reverse();
  }

  void _close() {
    if (!_open) return;
    setState(() => _open = false);
    _c.reverse();
  }

  void _back() {
    _close();
    final GoRouter r = ref.read(routerProvider);
    r.canPop() ? r.pop() : r.go('/home');
  }

  void _goto(String path) {
    _close();
    // push (не go): переход добавляется в стек — остаётся возможность вернуться,
    // и кнопка «Назад» продолжает показываться на разделе.
    ref.read(routerProvider).push(path);
  }

  void _gohome() {
    _close();
    // Главная — сброс к корню (go): стек схлопывается, кнопка прячется, как и надо.
    ref.read(routerProvider).go('/home');
  }

  @override
  Widget build(BuildContext context) {
    final bool authed = ref.watch(sessionProvider).status == AuthStatus.authenticated;
    // Прячем на экране проведения (он открывается через MaterialPageRoute — по
    // маршруту не поймать, поэтому по флагу).
    final bool onConduct = ref.watch(activeWorkoutOnScreenProvider);
    return Stack(
      children: <Widget>[
        widget.child,
        if (authed)
          ListenableBuilder(
            listenable: navCanGoBack,
            builder: (BuildContext context, Widget? _) {
              // Кнопка нужна там, откуда есть куда вернуться (не на главной) и не
              // на проведении тренировки.
              final bool show = navCanGoBack.value && !onConduct;
              debugPrint('NAVFAB canBack=${navCanGoBack.value} conduct=$onConduct show=$show');
              if (!show) {
                if (_open) {
                  _open = false;
                  _c.value = 0;
                }
                return const SizedBox.shrink();
              }
              return _overlay(context);
            },
          ),
      ],
    );
  }

  Widget _overlay(BuildContext context) {
    final AppColors c = context.colors;
    final Size size = MediaQuery.of(context).size;
    final EdgeInsets pad = MediaQuery.of(context).padding;
    final double left = 16 + pad.left;
    final double minTop = pad.top + 8;
    final double maxTop = size.height - _fabSize - pad.bottom - 8;
    final double defTop = size.height - _fabSize - pad.bottom - 110;
    final double fabTop = (_top ?? defTop).clamp(minTop, maxTop);

    // Пункты меню снизу вверх: ближайший к кнопке — первый.
    final List<(IconData, VoidCallback)> items = <(IconData, VoidCallback)>[
      (Icons.arrow_back_rounded, _back),
      (Icons.home_rounded, _gohome),
      (Icons.calendar_month_rounded, () => _goto('/calendar')),
      (Icons.account_balance_wallet_rounded, () => _goto('/accounting')),
    ];

    return AnimatedBuilder(
      animation: _c,
      builder: (BuildContext context, Widget? _) {
        final double v = _c.value;
        final double vp = Curves.easeOut.transform(v);
        return Stack(
          children: <Widget>[
            if (v > 0)
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: _close,
                  child: ColoredBox(color: Color.fromRGBO(0, 0, 0, 0.45 * v)),
                ),
              ),
            for (int i = 0; i < items.length; i++)
              Positioned(
                left: left,
                // Раскрываются ВВЕРХ от кнопки (пункты «всплывают» по мере анимации).
                top: fabTop - (i + 1) * _gap * vp,
                child: IgnorePointer(
                  ignoring: v < 0.85,
                  child: Opacity(
                    opacity: v.clamp(0.0, 1.0),
                    child: _MenuButton(icon: items[i].$1, onTap: items[i].$2),
                  ),
                ),
              ),
            Positioned(left: left, top: fabTop, child: _mainFab(c)),
          ],
        );
      },
    );
  }

  void _drag(DragUpdateDetails d) {
    final Size size = MediaQuery.of(context).size;
    final EdgeInsets pad = MediaQuery.of(context).padding;
    final double minTop = pad.top + 8;
    final double maxTop = size.height - _fabSize - pad.bottom - 8;
    final double base = _top ?? (size.height - _fabSize - pad.bottom - 110);
    setState(() => _top = (base + d.delta.dy).clamp(minTop, maxTop));
  }

  Widget _mainFab(AppColors c) {
    // RawGestureDetector — чтобы задать КОРОТКОЕ удержание (по умолчанию ~500 мс).
    // Тап — назад; удержание ~220 мс — меню; вертикальный драг — перенос вдоль края.
    return RawGestureDetector(
      gestures: <Type, GestureRecognizerFactory>{
        TapGestureRecognizer: GestureRecognizerFactoryWithHandlers<TapGestureRecognizer>(
          () => TapGestureRecognizer(),
          (TapGestureRecognizer r) => r.onTap = _open ? _close : _back,
        ),
        LongPressGestureRecognizer: GestureRecognizerFactoryWithHandlers<LongPressGestureRecognizer>(
          () => LongPressGestureRecognizer(duration: const Duration(milliseconds: 220)),
          (LongPressGestureRecognizer r) => r.onLongPress = _toggle,
        ),
        VerticalDragGestureRecognizer: GestureRecognizerFactoryWithHandlers<VerticalDragGestureRecognizer>(
          () => VerticalDragGestureRecognizer(),
          (VerticalDragGestureRecognizer r) => r.onUpdate = _drag,
        ),
      },
      child: Container(
        width: _fabSize,
        height: _fabSize,
        decoration: BoxDecoration(
          color: c.accent,
          shape: BoxShape.circle,
          boxShadow: <BoxShadow>[
            BoxShadow(color: Colors.black.withValues(alpha: 0.28), blurRadius: 12, offset: const Offset(0, 4)),
          ],
        ),
        // При раскрытом меню тоже стрелка «Назад» (крестик не ставим).
        child: Icon(Icons.arrow_back_rounded, color: c.accentOn, size: 26),
      ),
    );
  }
}

/// Пункт меню: круглая мини-кнопка с иконкой (без подписи).
class _MenuButton extends StatelessWidget {
  const _MenuButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: c.card,
          shape: BoxShape.circle,
          border: Border.all(color: c.line),
          boxShadow: <BoxShadow>[
            BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 8, offset: const Offset(0, 2)),
          ],
        ),
        child: Icon(icon, color: c.accent, size: 22),
      ),
    );
  }
}
