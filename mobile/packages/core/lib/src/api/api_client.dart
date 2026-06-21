import 'package:dio/dio.dart';

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

  Future<Map<String, dynamic>> getJson(String path) async {
    final Response<dynamic> r = await _dio.get<dynamic>(path);
    return _asMap(r.data);
  }

  Future<Map<String, dynamic>> postJson(String path, [Object? body]) async {
    final Response<dynamic> r = await _dio.post<dynamic>(path, data: body);
    return _asMap(r.data);
  }

  Future<Map<String, dynamic>> patchJson(String path, [Object? body]) async {
    final Response<dynamic> r = await _dio.patch<dynamic>(path, data: body);
    return _asMap(r.data);
  }

  Future<Map<String, dynamic>> deleteJson(String path, [Object? body]) async {
    final Response<dynamic> r = await _dio.delete<dynamic>(path, data: body);
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
