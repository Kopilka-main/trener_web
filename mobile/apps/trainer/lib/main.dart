import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() {
  runApp(const ProviderScope(child: TrainerApp()));
}

/// Тренерское приложение Trener. Пока — каркас с фирменной темой;
/// экраны входа и главной добавляются в следующих шагах фазы 1.
class TrainerApp extends StatelessWidget {
  const TrainerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Trener — тренер',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(AppAccents.trainer),
      home: const Scaffold(
        body: Center(
          child: Text('Trener · тренер', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
        ),
      ),
    );
  }
}
