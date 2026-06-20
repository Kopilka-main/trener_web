import 'package:core/core.dart';
import 'package:flutter/material.dart';

/// Заглушка ещё не реализованной секции (Прогресс / База знаний / Уведомления).
/// Появится в следующих шагах паритета с вебом.
class StubScreen extends StatelessWidget {
  const StubScreen({super.key, required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(Icons.construction_outlined, size: 40, color: c.inkMutedXl),
            const SizedBox(height: 12),
            Text('Раздел скоро появится', style: TextStyle(color: c.inkMuted)),
          ],
        ),
      ),
    );
  }
}
