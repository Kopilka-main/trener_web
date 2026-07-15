import 'package:core/core.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('online только когда есть интерфейс И API достижим', () async {
    Future<bool> t() async => true;
    Future<bool> f() async => false;

    expect(await NetworkStatus(hasInterface: t, reachable: t).isOnline(), true);
    expect(await NetworkStatus(hasInterface: t, reachable: f).isOnline(), false);
    expect(await NetworkStatus(hasInterface: f, reachable: t).isOnline(), false);
  });

  test('reachable не вызывается, если интерфейса нет (короткое замыкание)', () async {
    var reachableCalls = 0;
    final ns = NetworkStatus(
      hasInterface: () async => false,
      reachable: () async {
        reachableCalls++;
        return true;
      },
    );
    expect(await ns.isOnline(), false);
    expect(reachableCalls, 0);
  });
}
