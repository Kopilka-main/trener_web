import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/trainer_auth.dart';

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
  String? _error;

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  /// Клиентская проверка полей — мгновенная и конкретная (сервер на валидацию
  /// отдаёт общее «Ошибка валидации»).
  String? _validate(String first, String last, String email, String password) {
    if (first.isEmpty) return 'Укажите имя.';
    if (last.isEmpty) return 'Укажите фамилию.';
    if (!email.contains('@') || !email.contains('.')) return 'Введите корректный email.';
    if (password.length < 8) return 'Пароль должен быть не короче 8 символов.';
    return null;
  }

  Future<void> _submit() async {
    final String email = _email.text.trim();
    final String password = _password.text;
    final String first = _first.text.trim();
    final String last = _last.text.trim();
    final String? invalid = _validate(first, last, email, password);
    if (invalid != null) {
      setState(() => _error = invalid);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(trainerApiProvider).register(email, password, first, last);
    } catch (e) {
      setState(() =>
          _error = describeApiError(e, fallback: 'Не удалось зарегистрироваться. Попробуйте снова.'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Регистрация')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.all(24),
              children: <Widget>[
                TextField(controller: _first, decoration: const InputDecoration(labelText: 'Имя')),
                const SizedBox(height: 12),
                TextField(controller: _last, decoration: const InputDecoration(labelText: 'Фамилия')),
                const SizedBox(height: 12),
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: const InputDecoration(labelText: 'Почта'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _password,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Пароль (от 8 символов)'),
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
                      : const Text('Зарегистрироваться'),
                ),
                TextButton(
                  onPressed: () => context.go('/login'),
                  child: const Text('У меня уже есть аккаунт'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
