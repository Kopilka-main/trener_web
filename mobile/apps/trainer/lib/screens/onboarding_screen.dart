import 'package:core/core.dart';
import 'package:flutter/material.dart';

/// Один слайд приветственной карусели: иконка + заголовок + пояснение.
class _OnboardingSlide {
  const _OnboardingSlide({required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title;
  final String body;
}

/// Сиквенс шагов «как пользоваться» — от установки приложения клиенту до работы
/// в календаре и отслеживания прогресса. Порядок важен: нумерация «ШАГ N ИЗ …»
/// отражает реальный флоу (счётчик берётся из длины списка).
const List<_OnboardingSlide> _slides = <_OnboardingSlide>[
  _OnboardingSlide(
    icon: Icons.smartphone,
    title: 'Установите приложение клиенту',
    body: 'Попросите клиента скачать приложение FitFlow и зарегистрироваться.',
  ),
  _OnboardingSlide(
    icon: Icons.qr_code_2,
    title: 'У клиента появятся ID и QR-код',
    body: 'После регистрации в своём профиле клиент увидит уникальный ID и QR-код.',
  ),
  _OnboardingSlide(
    icon: Icons.person_add_alt_1,
    title: 'Добавьте клиента',
    body: 'Отсканируйте QR-код камерой или скопируйте ID клиента в новую карточку клиента.',
  ),
  _OnboardingSlide(
    icon: Icons.receipt_long,
    title: 'Заведите пакет тренировок',
    body: 'Укажите блок проданных тренировок — так и вы, и клиент ведёте учёт.',
  ),
  _OnboardingSlide(
    icon: Icons.fitness_center,
    title: 'Составьте программу',
    body: 'Разработайте программу тренировок для клиента из базы упражнений.',
  ),
  _OnboardingSlide(
    icon: Icons.calendar_month,
    title: 'Работайте в календаре',
    body: 'Назначайте и согласовывайте тренировки в календаре.',
  ),
  _OnboardingSlide(
    icon: Icons.insights,
    title: 'Смотрите статистику',
    body: 'В карточке клиента — прогресс по каждому упражнению: веса, повторы, объём.',
  ),
  _OnboardingSlide(
    icon: Icons.straighten,
    title: 'Ведите замеры',
    body: 'Фиксируйте замеры тела клиента и отслеживайте динамику прогресса.',
  ),
  _OnboardingSlide(
    icon: Icons.photo_library_outlined,
    title: 'Фото прогресса',
    body: 'Добавляйте фото прогресса клиента и сравнивайте результат до и после.',
  ),
];

/// Полноэкранная приветственная карусель для НОВОГО тренера. Показывается один
/// раз сразу после регистрации: свайп-слайды «как пользоваться» и финальная
/// приз-страница с приглашением в разработку. [onDone] вызывается по
/// «Пропустить» и по кнопке «Понятно» в окне-подтверждении участия.
/// [onParticipate] вызывается, когда тренер протянул свайп «Принять участие».
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key, required this.onDone, required this.onParticipate});
  final VoidCallback onDone;
  final VoidCallback onParticipate;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _controller = PageController();
  int _index = 0;
  bool _confirmed = false; // свайп протянут → показываем окно-«спасибо»

  // Индекс приз-страницы = сразу после обычных слайдов; всего страниц +1.
  int get _prizeIndex => _slides.length;
  int get _pageCount => _slides.length + 1;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _next() {
    // Листаем к следующей странице (последний обычный слайд ведёт на приз-стр.).
    _controller.nextPage(
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOut,
    );
  }

  // Свайп «Принять участие» протянут до конца: включаем dev-режим и показываем
  // полноэкранное окно-подтверждение.
  void _participate() {
    widget.onParticipate();
    setState(() => _confirmed = true);
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    // Окно-подтверждение участия занимает весь экран; «Понятно» → onDone.
    if (_confirmed) return _ThanksView(onDone: widget.onDone);

    final bool onPrize = _index == _prizeIndex;
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: <Widget>[
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _pageCount,
                onPageChanged: (int i) => setState(() => _index = i),
                itemBuilder: (BuildContext context, int i) => i == _prizeIndex
                    ? const _PrizeView()
                    : _SlideView(slide: _slides[i], step: i + 1, total: _slides.length),
              ),
            ),
            // Низ экрана — one-handed: индикатор и элементы управления под пальцем.
            _Dots(count: _pageCount, active: _index),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
              child: onPrize
                  ? Column(
                      children: <Widget>[
                        _SwipeToConfirm(label: 'Принять участие', onConfirmed: _participate),
                        const SizedBox(height: 6),
                        TextButton(
                          onPressed: widget.onDone,
                          style: TextButton.styleFrom(foregroundColor: c.inkMuted),
                          child: const Text('Пропустить'),
                        ),
                      ],
                    )
                  : Row(
                      children: <Widget>[
                        TextButton(
                          onPressed: widget.onDone,
                          style: TextButton.styleFrom(foregroundColor: c.inkMuted),
                          child: const Text('Пропустить'),
                        ),
                        const Spacer(),
                        FilledButton(
                          onPressed: _next,
                          style: FilledButton.styleFrom(minimumSize: const Size(128, 50)),
                          child: const Text('Далее'),
                        ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Содержимое одного слайда, вертикально по центру экрана.
class _SlideView extends StatelessWidget {
  const _SlideView({required this.slide, required this.step, required this.total});
  final _OnboardingSlide slide;
  final int step;
  final int total;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Text(
            'ШАГ $step ИЗ $total',
            textAlign: TextAlign.center,
            style: AppFonts.mono(size: 11, color: c.inkMutedXl),
          ),
          const SizedBox(height: 24),
          Container(
            width: 96,
            height: 96,
            decoration: BoxDecoration(
              color: c.accent.withValues(alpha: 0.14),
              shape: BoxShape.circle,
            ),
            child: Icon(slide.icon, size: 44, color: c.accent),
          ),
          const SizedBox(height: 28),
          Text(
            slide.title,
            textAlign: TextAlign.center,
            style: AppFonts.display(size: 26, color: c.ink),
          ),
          const SizedBox(height: 12),
          Text(
            slide.body,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 15, color: c.inkMuted, height: 1.4),
          ),
        ],
      ),
    );
  }
}

/// Финальная приз-страница: приглашение участвовать в разработке. Кнопки
/// «Далее»/«Начать» тут нет — вместо неё внизу свайп-подтверждение.
class _PrizeView extends StatelessWidget {
  const _PrizeView();

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Container(
            width: 96,
            height: 96,
            decoration: BoxDecoration(
              color: c.accent.withValues(alpha: 0.14),
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.card_giftcard, size: 44, color: c.accent),
          ),
          const SizedBox(height: 28),
          Text(
            'Примите участие в разработке',
            textAlign: TextAlign.center,
            style: AppFonts.display(size: 26, color: c.ink),
          ),
          const SizedBox(height: 12),
          Text(
            'Сообщайте о проблемах и предлагайте функции — и получите бесплатный доступ навсегда.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 15, color: c.inkMuted, height: 1.4),
          ),
        ],
      ),
    );
  }
}

/// Свайп-подтверждение: ползунок тянут вправо; при протягивании ~85% ширины
/// срабатывает [onConfirmed]. Отпускание раньше порога — ползунок едет назад.
class _SwipeToConfirm extends StatefulWidget {
  const _SwipeToConfirm({required this.label, required this.onConfirmed});
  final String label;
  final VoidCallback onConfirmed;

  @override
  State<_SwipeToConfirm> createState() => _SwipeToConfirmState();
}

class _SwipeToConfirmState extends State<_SwipeToConfirm> {
  static const double _h = 56; // высота дорожки
  static const double _thumb = 48; // диаметр ползунка
  static const double _inset = 4; // отступ ползунка от краёв дорожки
  static const double _threshold = 0.85; // доля хода для срабатывания

  double _dx = 0; // смещение ползунка
  bool _fired = false;

  void _fire() {
    if (_fired) return;
    _fired = true;
    widget.onConfirmed();
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final double maxDx = (constraints.maxWidth - _thumb - _inset * 2).clamp(0, double.infinity);
        final double clamped = _dx.clamp(0, maxDx);
        final double progress = maxDx <= 0 ? 0 : clamped / maxDx;
        return Container(
          height: _h,
          alignment: Alignment.centerLeft,
          decoration: BoxDecoration(
            color: c.accent.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(_h / 2),
            border: Border.all(color: c.accent.withValues(alpha: 0.40)),
          ),
          child: Stack(
            alignment: Alignment.center,
            children: <Widget>[
              // Подпись тускнеет по мере протягивания ползунка.
              Opacity(
                opacity: (1 - progress).clamp(0.0, 1.0),
                child: Text(
                  widget.label,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.accent),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(_inset),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Transform.translate(
                    offset: Offset(clamped, 0),
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onHorizontalDragUpdate: (DragUpdateDetails d) {
                        if (_fired) return;
                        setState(() => _dx = (_dx + d.delta.dx).clamp(0, maxDx));
                        if (_dx >= maxDx - 0.5) _fire();
                      },
                      onHorizontalDragEnd: (DragEndDetails _) {
                        if (_fired) return;
                        if (_dx >= maxDx * _threshold) {
                          setState(() => _dx = maxDx);
                          _fire();
                        } else {
                          setState(() => _dx = 0);
                        }
                      },
                      child: Container(
                        width: _thumb,
                        height: _thumb,
                        decoration: BoxDecoration(color: c.accent, shape: BoxShape.circle),
                        child: Icon(Icons.arrow_forward, size: 22, color: c.accentOn),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Полноэкранное окно-подтверждение участия. Появляется после свайпа: иконка,
/// «спасибо» и подсказка про кнопку «Сообщить о проблеме». «Понятно» → [onDone].
class _ThanksView extends StatelessWidget {
  const _ThanksView({required this.onDone});
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(32, 24, 32, 20),
          child: Column(
            children: <Widget>[
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: <Widget>[
                    Container(
                      width: 96,
                      height: 96,
                      decoration: BoxDecoration(
                        color: c.accent.withValues(alpha: 0.14),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.workspace_premium, size: 44, color: c.accent),
                    ),
                    const SizedBox(height: 28),
                    Text(
                      'Спасибо! Вы — участник разработки',
                      textAlign: TextAlign.center,
                      style: AppFonts.display(size: 24, color: c.ink),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'На экране появилась кнопка «Сообщить о проблеме». Нажмите её, если нашли '
                      'проблему или хотите предложить функцию — так вы помогаете развивать приложение.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 15, color: c.inkMuted, height: 1.4),
                    ),
                  ],
                ),
              ),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: onDone,
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 52)),
                  child: const Text('Понятно'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Ряд точек-индикатор прогресса карусели.
class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.active});
  final int count;
  final int active;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List<Widget>.generate(count, (int i) {
        final bool on = i == active;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          margin: const EdgeInsets.symmetric(horizontal: 4),
          width: on ? 20 : 8,
          height: 8,
          decoration: BoxDecoration(
            color: on ? c.accent : c.line,
            borderRadius: BorderRadius.circular(4),
          ),
        );
      }),
    );
  }
}
