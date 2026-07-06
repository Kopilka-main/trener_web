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
/// в календаре. Порядок важен: нумерация «ШАГ N ИЗ 6» отражает реальный флоу.
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
];

/// Полноэкранная приветственная карусель для НОВОГО тренера. Показывается один
/// раз сразу после регистрации: 6 свайп-слайдов «как пользоваться». [onDone]
/// вызывается по «Пропустить» и по «Начать» на последнем слайде.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key, required this.onDone});
  final VoidCallback onDone;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _controller = PageController();
  int _index = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _next() {
    if (_index >= _slides.length - 1) {
      widget.onDone();
      return;
    }
    _controller.nextPage(
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final bool isLast = _index == _slides.length - 1;
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: <Widget>[
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _slides.length,
                onPageChanged: (int i) => setState(() => _index = i),
                itemBuilder: (BuildContext context, int i) =>
                    _SlideView(slide: _slides[i], step: i + 1, total: _slides.length),
              ),
            ),
            // Низ экрана — one-handed: индикатор и кнопки под большим пальцем.
            _Dots(count: _slides.length, active: _index),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
              child: Row(
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
                    child: Text(isLast ? 'Начать' : 'Далее'),
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
