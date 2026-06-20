import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:trener_trainer/main.dart';

void main() {
  testWidgets('каркас тренерского приложения рендерится', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: TrainerApp()));
    expect(find.text('Trener · тренер'), findsOneWidget);
  });
}
