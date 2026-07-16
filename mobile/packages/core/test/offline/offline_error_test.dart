import 'package:core/core.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  DioException dio(DioExceptionType t) =>
      DioException(requestOptions: RequestOptions(path: '/x'), type: t);

  test('офлайн-ошибки dio → true', () {
    expect(isOfflineError(dio(DioExceptionType.connectionError)), true);
    expect(isOfflineError(dio(DioExceptionType.connectionTimeout)), true);
    expect(isOfflineError(dio(DioExceptionType.receiveTimeout)), true);
  });

  test('ответ сервера (badResponse) и прочее → false', () {
    expect(isOfflineError(dio(DioExceptionType.badResponse)), false);
    expect(isOfflineError(Exception('x')), false);
  });
}
