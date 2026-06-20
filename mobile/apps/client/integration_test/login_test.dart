import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:trener_client/main.dart';

/// Сквозной тест на устройстве/эмуляторе: реальный логин клиента против БОЕВОГО
/// API (my.fitbond.ru) и переход на главную с именем. Использует тестовый аккаунт
/// mobileclient@fitbond.ru.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('логин клиента → главная показывает имя', (WidgetTester tester) async {
    // Начинаем с чистого состояния (без сохранённого токена).
    await TokenStore().clear();

    await tester.pumpWidget(
      ProviderScope(
        overrides: <Override>[
          baseUrlProvider.overrideWithValue('https://my.fitbond.ru'),
        ],
        child: const ClientApp(),
      ),
    );
    await tester.pumpAndSettle();

    // Должны оказаться на экране входа.
    expect(find.text('Вход'), findsOneWidget);

    final Finder fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'mobileclient@fitbond.ru');
    await tester.enterText(fields.at(1), 'longenough1');
    await tester.tap(find.text('Войти'));

    // Ждём сеть (login → me → переход на главную).
    for (int i = 0; i < 60; i++) {
      await tester.pump(const Duration(milliseconds: 500));
      if (find.text('Mobile Client').evaluate().isNotEmpty) break;
    }

    expect(find.text('Mobile Client'), findsOneWidget);
  });
}
