import 'package:dio/dio.dart';

/// HTTP-статус из ошибки API (DioException) или null — чтобы вызывающий код не
/// импортировал dio напрямую (различение 401/409 и т.п.).
int? apiErrorStatus(Object error) =>
    error is DioException ? error.response?.statusCode : null;

/// Текст ошибки от сервера (тело `{ error: ... }`) или null.
String? apiErrorMessage(Object error) {
  if (error is DioException) {
    final dynamic d = error.response?.data;
    if (d is Map && d['error'] is String) return d['error'] as String;
  }
  return null;
}

/// Код ошибки от сервера (тело `{ code: ... }`, например `EMAIL_TAKEN`) или null.
String? apiErrorCode(Object error) {
  if (error is DioException) {
    final dynamic d = error.response?.data;
    if (d is Map && d['code'] is String) return d['code'] as String;
  }
  return null;
}

/// Человекочитаемое сообщение об ошибке для UI: сперва сообщение сервера
/// (`{ error: ... }`), затем понятный текст для сетевых сбоев, иначе [fallback].
/// Сообщения валидации (общее «Ошибка валидации») заменяем на [fallback] —
/// конкретику по полям лучше проверять на клиенте до запроса.
String describeApiError(Object error, {String fallback = 'Что-то пошло не так. Попробуйте ещё раз.'}) {
  if (error is DioException) {
    switch (error.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'Нет связи с сервером. Проверьте интернет и попробуйте снова.';
      case DioExceptionType.badCertificate:
        return 'Не удалось установить защищённое соединение.';
      default:
        break;
    }
  }
  if (apiErrorCode(error) == 'VALIDATION_ERROR') return fallback;
  final String? msg = apiErrorMessage(error);
  if (msg != null && msg.trim().isNotEmpty) return msg;
  return fallback;
}

/// Возвращает текущий токен сессии (или null, если не авторизован).
typedef TokenProvider = Future<String?> Function();

/// Реакция на 401 от сервера (обычно — сбросить сессию/токен).
typedef OnUnauthorized = Future<void> Function();

/// Тонкая обёртка над Dio: базовый URL, заголовок Authorization: Bearer и
/// обработка 401. JSON-ответы возвращаются как `Map<String, dynamic>`.
class ApiClient {
  ApiClient({
    required String baseUrl,
    required TokenProvider tokenProvider,
    OnUnauthorized? onUnauthorized,
  }) : _dio = Dio(
          BaseOptions(
            baseUrl: baseUrl,
            connectTimeout: const Duration(seconds: 15),
            receiveTimeout: const Duration(seconds: 20),
            contentType: 'application/json',
          ),
        ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final String? token = await tokenProvider();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (DioException e, handler) async {
          if (e.response?.statusCode == 401 && onUnauthorized != null) {
            await onUnauthorized();
          }
          handler.next(e);
        },
      ),
    );
  }

  final Dio _dio;

  // Жёсткий дедлайн запроса: гарантия, что UI не зависнет в спиннере, даже если
  // внутренние таймауты Dio не сработали (сервер «молча» умер посреди запроса —
  // соединение есть, ответа/RST нет). Future.timeout — гарантия Dart, не Dio.
  static const Duration _deadline = Duration(seconds: 20);

  Future<Response<dynamic>> _guard(Future<Response<dynamic>> req, String path) {
    return req.timeout(
      _deadline,
      onTimeout: () => throw DioException(
        requestOptions: RequestOptions(path: path),
        type: DioExceptionType.receiveTimeout,
        error: 'Превышено время ожидания ответа',
      ),
    );
  }

  Future<Map<String, dynamic>> getJson(String path) async {
    final Response<dynamic> r = await _guard(_dio.get<dynamic>(path), path);
    return _asMap(r.data);
  }

  Future<Map<String, dynamic>> postJson(String path, [Object? body]) async {
    // Пустое тело при content-type application/json → Fastify 400
    // (FST_ERR_CTP_EMPTY_JSON_BODY). Шлём {} вместо null.
    final Response<dynamic> r =
        await _guard(_dio.post<dynamic>(path, data: body ?? const <String, dynamic>{}), path);
    return _asMap(r.data);
  }

  Future<Map<String, dynamic>> patchJson(String path, [Object? body]) async {
    final Response<dynamic> r = await _guard(_dio.patch<dynamic>(path, data: body), path);
    return _asMap(r.data);
  }

  Future<Map<String, dynamic>> deleteJson(String path, [Object? body]) async {
    final Response<dynamic> r =
        await _guard(_dio.delete<dynamic>(path, data: body ?? const <String, dynamic>{}), path);
    return _asMap(r.data);
  }

  /// POST multipart/form-data. [fields] — текстовые поля; [file] — опциональный
  /// файл (поле, путь, имя). Нужен для роутов, читающих form-data (мед.карта, аватар).
  Future<Map<String, dynamic>> postForm(
    String path,
    Map<String, String> fields, {
    String? fileField,
    String? filePath,
    String? fileName,
  }) async {
    final Map<String, dynamic> map = <String, dynamic>{...fields};
    if (fileField != null && filePath != null) {
      map[fileField] = await MultipartFile.fromFile(filePath, filename: fileName);
    }
    final FormData form = FormData.fromMap(map);
    final Response<dynamic> r = await _dio.post<dynamic>(path, data: form);
    return _asMap(r.data);
  }

  Map<String, dynamic> _asMap(dynamic data) {
    if (data is Map<String, dynamic>) return data;
    return <String, dynamic>{};
  }
}
