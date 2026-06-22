import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/client_auth.dart';
import '../widgets/auth_form.dart';

final RegExp _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();
  bool _busy = false;
  // Ошибки валидации показываем только после первой неудачной отправки (как в вебе).
  bool _showErrors = false;
  String? _serverError;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  String? get _emailError {
    final String v = _email.text.trim();
    if (v.isEmpty) return 'Укажите email';
    if (!_emailRe.hasMatch(v)) return 'Некорректный email';
    return null;
  }

  String? get _passwordError => _password.text.isEmpty ? 'Укажите пароль' : null;

  bool get _hasErrors => _emailError != null || _passwordError != null;

  Future<void> _submit() async {
    if (_hasErrors) {
      setState(() => _showErrors = true);
      return;
    }
    setState(() {
      _busy = true;
      _serverError = null;
    });
    try {
      await ref.read(clientApiProvider).login(_email.text.trim(), _password.text);
      // Навигации нет: роутер уведёт в приложение по смене состояния сессии.
    } catch (e) {
      setState(() => _serverError = describeApiError(e, fallback: 'Не удалось войти. Попробуйте позже.'));
    } finally {
      if (mounted) setState(() => _busy = false);
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
                Text('Вход',
                    style: AppFonts.display(size: 40, color: c.accent, letterSpacing: -0.8)),
                const SizedBox(height: 24),
                AuthField(
                  controller: _email,
                  label: 'Email',
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const <String>[AutofillHints.email],
                  textInputAction: TextInputAction.next,
                  error: _showErrors ? _emailError : null,
                  onChanged: (_) {
                    if (_showErrors) setState(() {});
                  },
                ),
                const SizedBox(height: 16),
                AuthField(
                  controller: _password,
                  label: 'Пароль',
                  obscure: true,
                  autofillHints: const <String>[AutofillHints.password],
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
                  label: 'Войти',
                  busyLabel: 'Входим…',
                  busy: _busy,
                  onPressed: _submit,
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
