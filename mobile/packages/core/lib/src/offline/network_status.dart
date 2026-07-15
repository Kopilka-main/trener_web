// Приватные поля + публичные именованные параметры → initializing formals
// неприменимы (именованный параметр не может начинаться с `_`).
// ignore_for_file: prefer_initializing_formals

/// Определяет реальную доступность бэкенда: сеть есть И API отвечает.
/// Зависимости инъектируются, чтобы логику можно было тестировать без сети.
/// Riverpod-провайдер (связка с connectivity_plus и пробой API) — в приложении.
class NetworkStatus {
  NetworkStatus({
    required Future<bool> Function() hasInterface,
    required Future<bool> Function() reachable,
  })  : _hasInterface = hasInterface,
        _reachable = reachable;

  final Future<bool> Function() _hasInterface;
  final Future<bool> Function() _reachable;

  /// true только если есть сетевой интерфейс И бэкенд реально достижим
  /// (важно для «Wi-Fi есть, интернета нет» — частый случай в зале).
  Future<bool> isOnline() async {
    if (!await _hasInterface()) return false;
    return _reachable();
  }
}
