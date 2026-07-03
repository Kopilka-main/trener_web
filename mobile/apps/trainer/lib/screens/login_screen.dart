import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/trainer_auth.dart';
import '../widgets/auth_form.dart';
import 'forgot_password_screen.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(trainerApiProvider).login(_email.text.trim(), _password.text);
      // Дальше редирект на главную сделает роутер (по смене сессии).
    } catch (e) {
      setState(() => _error = describeApiError(e, fallback: 'Не удалось войти. Проверьте почту и пароль.'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Вход через OAuth-провайдера ([provider] ∈ {vk, yandex}): открывает WebView,
  /// при успехе сохраняет сессию (роутер уведёт на главную по смене сессии).
  Future<void> _oauth(String provider, String title) async {
    final String? token = await Navigator.of(context).push<String>(
      MaterialPageRoute<String>(
        builder: (_) => OAuthWebViewScreen(
          provider: provider,
          app: 'trainer',
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
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
              children: <Widget>[
                const AuthHeader(
                  eyebrow: 'FITFLOW · CRM',
                  title: 'Вход',
                  subtitle: 'С возвращением',
                ),
                const SizedBox(height: 24),
                AuthField(
                  controller: _email,
                  label: 'Почта',
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const <String>[AutofillHints.email],
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 16),
                AuthField(
                  controller: _password,
                  label: 'Пароль',
                  obscure: true,
                  autofillHints: const <String>[AutofillHints.password],
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                ),
                if (_error != null) ...<Widget>[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(fontSize: 14, color: c.danger)),
                ],
                const SizedBox(height: 20),
                AuthPrimaryButton(
                  label: 'Войти',
                  busyLabel: 'Входим…',
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
                Center(
                  child: GestureDetector(
                    onTap: () => Navigator.of(context).push<void>(
                      MaterialPageRoute<void>(builder: (_) => const ForgotPasswordScreen()),
                    ),
                    child: Text('Забыли пароль?',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.accent)),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: <Widget>[
                    Text('Нет аккаунта? ', style: TextStyle(fontSize: 14, color: c.inkMuted)),
                    GestureDetector(
                      onTap: () => context.go('/register'),
                      child: Text('Регистрация',
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
