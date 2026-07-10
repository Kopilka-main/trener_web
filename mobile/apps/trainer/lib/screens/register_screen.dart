import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/onboarding_flag.dart';
import '../api/trainer_auth.dart';
import '../widgets/auth_form.dart';

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
    // Имя/фамилия — с заглавной буквы автоматически.
    String cap(String s) {
      final String t = s.trim();
      return t.isEmpty ? t : t[0].toUpperCase() + t.substring(1);
    }

    final String email = _email.text.trim();
    final String password = _password.text;
    final String first = cap(_first.text);
    final String last = cap(_last.text);
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
      // Новый тренер: помечаем онбординг к показу (register уже установил токен →
      // сессия authenticated, флаг поднимаем следом — гейт поймает переход).
      // При входе через логин этот хук не срабатывает, поэтому существующие
      // пользователи карусель не видят.
      ref.read(onboardingPendingProvider.notifier).setPending();
    } catch (e) {
      setState(() =>
          _error = describeApiError(e, fallback: 'Не удалось зарегистрироваться. Попробуйте снова.'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Регистрация/вход через OAuth-провайдера ([provider] ∈ {vk, yandex}):
  /// открывает WebView, при успехе сохраняет сессию (роутер уведёт на главную).
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
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
              children: <Widget>[
                const AuthHeader(
                  eyebrow: 'FITFLOW · CRM',
                  title: 'Регистрация',
                  subtitle: 'Создание аккаунта тренера',
                ),
                const SizedBox(height: 24),
                AuthField(
                  controller: _first,
                  label: 'Имя',
                  autofillHints: const <String>[AutofillHints.givenName],
                  textInputAction: TextInputAction.next,
                  textCapitalization: TextCapitalization.words,
                ),
                const SizedBox(height: 16),
                AuthField(
                  controller: _last,
                  label: 'Фамилия',
                  autofillHints: const <String>[AutofillHints.familyName],
                  textInputAction: TextInputAction.next,
                  textCapitalization: TextCapitalization.words,
                ),
                const SizedBox(height: 16),
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
                  label: 'Пароль (от 8 символов)',
                  obscure: true,
                  autofillHints: const <String>[AutofillHints.newPassword],
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                ),
                if (_error != null) ...<Widget>[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(fontSize: 14, color: c.danger)),
                ],
                const SizedBox(height: 20),
                AuthPrimaryButton(
                  label: 'Зарегистрироваться',
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
