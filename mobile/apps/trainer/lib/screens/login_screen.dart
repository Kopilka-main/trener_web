import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/trainer_auth.dart';
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
  bool _hidden = true; // скрыт ли пароль (глазок переключает)
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
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.all(24),
              children: <Widget>[
                Text('Вход', style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 20),
                SelectAllTextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: const InputDecoration(labelText: 'Почта'),
                ),
                const SizedBox(height: 12),
                SelectAllTextField(
                  controller: _password,
                  obscureText: _hidden,
                  decoration: InputDecoration(
                    labelText: 'Пароль',
                    suffixIcon: IconButton(
                      tooltip: _hidden ? 'Показать пароль' : 'Скрыть пароль',
                      icon: Icon(_hidden
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined),
                      onPressed: () => setState(() => _hidden = !_hidden),
                    ),
                  ),
                  onSubmitted: (_) => _submit(),
                ),
                if (_error != null) ...<Widget>[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(
                          height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Войти'),
                ),
                const SizedBox(height: 20),
                const _OrDivider(),
                const SizedBox(height: 16),
                OutlinedButton(
                  onPressed: _busy ? null : () => _oauth('vk', 'Вход через VK'),
                  child: const Text('Войти через VK'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: _busy ? null : () => _oauth('yandex', 'Вход через Яндекс'),
                  child: const Text('Войти через Яндекс'),
                ),
                TextButton(
                  onPressed: () => context.go('/register'),
                  child: const Text('Регистрация'),
                ),
                TextButton(
                  onPressed: () => Navigator.of(context).push<void>(
                    MaterialPageRoute<void>(builder: (_) => const ForgotPasswordScreen()),
                  ),
                  child: const Text('Забыли пароль?'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Разделитель «или» между основным входом и OAuth-кнопками.
class _OrDivider extends StatelessWidget {
  const _OrDivider();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        const Expanded(child: Divider()),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text('или', style: Theme.of(context).textTheme.bodySmall),
        ),
        const Expanded(child: Divider()),
      ],
    );
  }
}
