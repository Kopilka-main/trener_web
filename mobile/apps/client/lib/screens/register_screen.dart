import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/client_auth.dart';
import '../api/onboarding_flag.dart';
import '../widgets/auth_form.dart';

final RegExp _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final TextEditingController _first = TextEditingController();
  final TextEditingController _last = TextEditingController();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();
  bool _busy = false;
  bool _showErrors = false;
  bool _emailTaken = false;
  String? _serverError;

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  String? get _firstError => _first.text.trim().isEmpty ? 'Укажите имя' : null;
  String? get _lastError => _last.text.trim().isEmpty ? 'Укажите фамилию' : null;
  String? get _emailClientError {
    final String v = _email.text.trim();
    if (v.isEmpty) return 'Укажите email';
    if (!_emailRe.hasMatch(v)) return 'Некорректный email';
    return null;
  }

  String? get _passwordError =>
      _password.text.length < 8 ? 'Пароль не короче 8 символов' : null;

  bool get _hasErrors =>
      _firstError != null || _lastError != null || _emailClientError != null || _passwordError != null;

  Future<void> _submit() async {
    if (_hasErrors) {
      setState(() => _showErrors = true);
      return;
    }
    setState(() {
      _busy = true;
      _serverError = null;
      _emailTaken = false;
    });
    try {
      await ref.read(clientApiProvider).register(
            _email.text.trim(),
            _password.text,
            _first.text.trim(),
            _last.text.trim(),
          );
      // Новый аккаунт: один раз после регистрации показать онбординг с QR/ID
      // для тренера (гейт снимет флаг по «Готово»). Логин этот флаг не ставит.
      ref.read(onboardingPendingProvider.notifier).setPending();
      // Навигации нет: роутер уведёт в приложение по смене состояния сессии.
    } catch (e) {
      if (apiErrorCode(e) == 'EMAIL_TAKEN') {
        setState(() => _emailTaken = true);
      } else {
        setState(() =>
            _serverError = describeApiError(e, fallback: 'Не удалось зарегистрироваться. Попробуйте позже.'));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Регистрация/вход через OAuth-провайдера ([provider] ∈ {vk, yandex}):
  /// открывает WebView, при успехе сохраняет сессию (роутер уведёт в приложение).
  Future<void> _oauth(String provider, String title) async {
    final String? token = await Navigator.of(context).push<String>(
      MaterialPageRoute<String>(
        builder: (_) => OAuthWebViewScreen(
          provider: provider,
          app: 'client',
          baseUrl: ref.read(baseUrlProvider),
          title: title,
        ),
      ),
    );
    if (!mounted) return;
    if (token != null && token.isNotEmpty) {
      await ref.read(sessionProvider.notifier).setToken(token);
    } else {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Не удалось войти')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    // Ошибка под Email: серверный EMAIL_TAKEN (всегда) ИЛИ клиентский формат (после отправки).
    final String? emailError =
        _emailTaken ? 'Email уже зарегистрирован' : (_showErrors ? _emailClientError : null);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
              children: <Widget>[
                const AuthHeader(
                  eyebrow: 'FITFLOW',
                  title: 'Регистрация',
                  subtitle: 'Создание аккаунта',
                ),
                const SizedBox(height: 24),
                AuthField(
                  controller: _first,
                  label: 'Имя',
                  autofillHints: const <String>[AutofillHints.givenName],
                  textInputAction: TextInputAction.next,
                  error: _showErrors ? _firstError : null,
                  onChanged: (_) {
                    if (_showErrors) setState(() {});
                  },
                ),
                const SizedBox(height: 16),
                AuthField(
                  controller: _last,
                  label: 'Фамилия',
                  autofillHints: const <String>[AutofillHints.familyName],
                  textInputAction: TextInputAction.next,
                  error: _showErrors ? _lastError : null,
                  onChanged: (_) {
                    if (_showErrors) setState(() {});
                  },
                ),
                const SizedBox(height: 16),
                AuthField(
                  controller: _email,
                  label: 'Email',
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const <String>[AutofillHints.email],
                  textInputAction: TextInputAction.next,
                  error: emailError,
                  // Правка email сбрасывает серверный EMAIL_TAKEN (как reg.reset() в вебе).
                  onChanged: (_) {
                    if (_emailTaken || _showErrors) setState(() => _emailTaken = false);
                  },
                ),
                const SizedBox(height: 16),
                AuthField(
                  controller: _password,
                  label: 'Пароль',
                  obscure: true,
                  autofillHints: const <String>[AutofillHints.newPassword],
                  textInputAction: TextInputAction.done,
                  error: _showErrors ? _passwordError : null,
                  onChanged: (_) {
                    if (_showErrors) setState(() {});
                  },
                  onSubmitted: (_) => _submit(),
                ),
                if (_serverError != null) ...<Widget>[
                  const SizedBox(height: 12),
                  Text(_serverError!, style: TextStyle(fontSize: 14, color: c.danger)),
                ],
                const SizedBox(height: 20),
                AuthPrimaryButton(
                  label: 'Создать аккаунт',
                  busyLabel: 'Создаём…',
                  busy: _busy,
                  onPressed: _submit,
                ),
                if (oauthLoginEnabled) ...<Widget>[
                  const SizedBox(height: 20),
                  const OAuthOrDivider(),
                  const SizedBox(height: 16),
                  OAuthButton(
                    label: 'Войти через VK',
                    onPressed: _busy ? null : () => _oauth('vk', 'Вход через VK'),
                  ),
                  const SizedBox(height: 10),
                  OAuthButton(
                    label: 'Войти через Яндекс',
                    onPressed: _busy ? null : () => _oauth('yandex', 'Вход через Яндекс'),
                  ),
                ],
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: <Widget>[
                    Text('Уже есть аккаунт? ', style: TextStyle(fontSize: 14, color: c.inkMuted)),
                    GestureDetector(
                      onTap: () => context.go('/login'),
                      child: Text('Войти',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.accent)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
