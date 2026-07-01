import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Экран OAuth-входа через провайдера (VK/Яндекс) в WebView.
///
/// Открывает `<baseUrl>/api/auth/oauth/<provider>?app=<app>`, пользователь
/// логинится у провайдера, бэкенд делает 302 на `.../api/auth/oauth/done` с
/// `?token=<sessionToken>` (успех) или `?error=<msg>` (ошибка). Экран
/// перехватывает этот URL по пути, достаёт токен и возвращает его через
/// `Navigator.pop(context, token)`. При ошибке/отмене возвращает `null`.
class OAuthWebViewScreen extends StatefulWidget {
  const OAuthWebViewScreen({
    super.key,
    required this.provider,
    required this.app,
    required this.baseUrl,
    this.title,
  });

  /// Провайдер OAuth: `vk` или `yandex`.
  final String provider;

  /// Приложение: `trainer` или `client`.
  final String app;

  /// Базовый URL API (`ref.read(baseUrlProvider)`).
  final String baseUrl;

  /// Заголовок AppBar (по умолчанию «Вход»).
  final String? title;

  @override
  State<OAuthWebViewScreen> createState() => _OAuthWebViewScreenState();
}

class _OAuthWebViewScreenState extends State<OAuthWebViewScreen> {
  late final WebViewController _controller;

  /// Защита от двойного pop: перехват может сработать и в onNavigationRequest,
  /// и в onUrlChange для одного и того же редиректа.
  bool _done = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (NavigationRequest request) {
            if (_isDoneUrl(request.url)) {
              _handleDone(request.url);
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
          onUrlChange: (UrlChange change) {
            final String? url = change.url;
            if (url != null && _isDoneUrl(url)) {
              _handleDone(url);
            }
          },
        ),
      )
      ..loadRequest(
        Uri.parse('${widget.baseUrl}/api/auth/oauth/${widget.provider}?app=${widget.app}'),
      );
  }

  /// Является ли URL финальным колбэком OAuth (`.../api/auth/oauth/done`).
  bool _isDoneUrl(String url) {
    final Uri uri = Uri.parse(url);
    return uri.path == '/api/auth/oauth/done' ||
        uri.path.endsWith('/api/auth/oauth/done');
  }

  /// Разбирает финальный URL и закрывает экран: token → возвращаем строку,
  /// иначе (error или пустой token) → null.
  void _handleDone(String url) {
    if (_done) return;
    _done = true;
    final Uri uri = Uri.parse(url);
    final String? token = uri.queryParameters['token'];
    if (token != null && token.isNotEmpty) {
      Navigator.of(context).pop(token);
    } else {
      Navigator.of(context).pop(null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title ?? 'Вход')),
      body: WebViewWidget(controller: _controller),
    );
  }
}
