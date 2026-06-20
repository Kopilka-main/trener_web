import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:trener_trainer/screens/login_screen.dart';

void main() {
  testWidgets('экран входа рендерит поля и кнопку', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: LoginScreen()),
      ),
    );
    expect(find.text('Вход'), findsOneWidget);
    expect(find.text('Войти'), findsOneWidget);
    expect(find.byType(TextField), findsNWidgets(2));
  });
}
