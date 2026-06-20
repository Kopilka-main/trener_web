import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() {
  runApp(const ProviderScope(child: ClientApp()));
}

/// Клиентское приложение Trener. Пока — каркас с фирменной темой;
/// экраны входа и главной добавляются в следующих шагах фазы 1.
class ClientApp extends StatelessWidget {
  const ClientApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Trener — клиент',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(AppAccents.client),
      home: const Scaffold(
        body: Center(
          child: Text('Trener · клиент', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
        ),
      ),
    );
  }
}
