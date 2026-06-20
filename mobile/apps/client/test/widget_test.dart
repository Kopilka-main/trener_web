import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:trener_client/main.dart';

void main() {
  testWidgets('каркас клиентского приложения рендерится', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: ClientApp()));
    expect(find.text('Trener · клиент'), findsOneWidget);
  });
}
