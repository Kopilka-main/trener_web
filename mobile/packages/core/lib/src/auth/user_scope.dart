import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Наблюдатель за провайдерами, отдающими [AsyncValue] — это `FutureProvider`/
/// `StreamProvider` (и их family), то есть именно те, что кэшируют данные,
/// загруженные с сервера под текущего пользователя.
///
/// Сервисные провайдеры (`Provider<XApi>`), сессия и тема значение AsyncValue не
/// отдают и сюда не попадают, поэтому при смене пользователя их трогать не нужно.
class UserScopeObserver extends ProviderObserver {
  final Set<ProviderBase<Object?>> _async = <ProviderBase<Object?>>{};

  /// Снимок активных data-провайдеров (копия — безопасно итерировать).
  List<ProviderBase<Object?>> get dataProviders => _async.toList();

  @override
  void didAddProvider(
    ProviderBase<Object?> provider,
    Object? value,
    ProviderContainer container,
  ) {
    if (value is AsyncValue) _async.add(provider);
  }

  @override
  void didUpdateProvider(
    ProviderBase<Object?> provider,
    Object? previousValue,
    Object? newValue,
    ProviderContainer container,
  ) {
    if (newValue is AsyncValue) _async.add(provider);
  }

  @override
  void didDisposeProvider(ProviderBase<Object?> provider, ProviderContainer container) {
    _async.remove(provider);
  }
}

/// Сбросить кэш всех data-провайдеров (вызывать при смене токена/пользователя),
/// иначе после входа под другим аккаунтом показываются данные предыдущего.
void resetUserScopedData(WidgetRef ref, UserScopeObserver observer) {
  for (final ProviderBase<Object?> p in observer.dataProviders) {
    ref.invalidate(p);
  }
}
