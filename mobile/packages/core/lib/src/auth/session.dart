import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'token_store.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

/// Состояние сессии: статус + токен (если есть). `unknown` — пока не проверили
/// хранилище на старте.
class SessionState {
  const SessionState(this.status, [this.token]);
  final AuthStatus status;
  final String? token;
}

final Provider<TokenStore> tokenStoreProvider =
    Provider<TokenStore>((ref) => TokenStore());

/// Управляет жизненным циклом токена: чтение на старте, сохранение при логине,
/// сброс при выходе/401.
class SessionController extends StateNotifier<SessionState> {
  SessionController(this._store) : super(const SessionState(AuthStatus.unknown));
  final TokenStore _store;

  /// Старт приложения: читаем токен из хранилища.
  Future<void> bootstrap() async {
    final String? token = await _store.read();
    state = SessionState(
      token == null ? AuthStatus.unauthenticated : AuthStatus.authenticated,
      token,
    );
  }

  Future<void> setToken(String token) async {
    await _store.write(token);
    state = SessionState(AuthStatus.authenticated, token);
  }

  Future<void> clear() async {
    await _store.clear();
    state = const SessionState(AuthStatus.unauthenticated);
  }
}

final StateNotifierProvider<SessionController, SessionState> sessionProvider =
    StateNotifierProvider<SessionController, SessionState>(
  (ref) => SessionController(ref.read(tokenStoreProvider)),
);
