import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Открывает камеру и возвращает код привязки клиента, считанный с QR
/// (или `null`, если пользователь закрыл экран). Извлекает accountId из ссылки
/// вида `https://app.fitbond.ru/link/<accountId>`, либо принимает «голый» код.
Future<String?> scanConnectCode(BuildContext context) {
  return Navigator.of(context).push<String>(
    MaterialPageRoute<String>(builder: (_) => const ConnectScanScreen(), fullscreenDialog: true),
  );
}

/// Из содержимого QR достаём код клиента: для ссылки `.../link/<code>` — сегмент
/// после `link`; для прочей ссылки — последний сегмент пути; иначе — сам текст.
String? extractConnectCode(String raw) {
  final String t = raw.trim();
  if (t.isEmpty) return null;
  final Uri? uri = Uri.tryParse(t);
  if (uri != null && uri.hasScheme) {
    final List<String> segs = uri.pathSegments.where((String s) => s.isNotEmpty).toList();
    final int i = segs.indexOf('link');
    if (i != -1 && i + 1 < segs.length) return segs[i + 1];
    if (segs.isNotEmpty) return segs.last;
  }
  return t;
}

/// Полноэкранный сканер QR-кода клиента. По первому распознанному коду закрывает
/// экран и возвращает извлечённый код привязки.
class ConnectScanScreen extends StatefulWidget {
  const ConnectScanScreen({super.key});

  @override
  State<ConnectScanScreen> createState() => _ConnectScanScreenState();
}

class _ConnectScanScreenState extends State<ConnectScanScreen> {
  final MobileScannerController _controller = MobileScannerController();
  bool _handled = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;
    for (final Barcode b in capture.barcodes) {
      final String? raw = b.rawValue;
      if (raw == null) continue;
      final String? code = extractConnectCode(raw);
      if (code != null && code.isNotEmpty) {
        _handled = true;
        Navigator.of(context).pop(code);
        return;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: <Widget>[
          MobileScanner(controller: _controller, onDetect: _onDetect),
          // Затемнение по краям + рамка-видоискатель по центру.
          Center(
            child: Container(
              width: 240,
              height: 240,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.white, width: 3),
                borderRadius: BorderRadius.circular(20),
              ),
            ),
          ),
          // Верхняя панель: закрыть + фонарик.
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: <Widget>[
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  IconButton(
                    icon: const Icon(Icons.flash_on, color: Colors.white),
                    onPressed: () => _controller.toggleTorch(),
                  ),
                ],
              ),
            ),
          ),
          // Подсказка снизу.
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
                child: const Text(
                  'Наведите камеру на QR-код из приложения клиента',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white, fontSize: 14),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
