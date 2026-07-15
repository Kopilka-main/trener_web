/// Минимальный ключ-значение стор списков JSON-объектов. Абстракция над
/// файловым `LocalJsonStore` — чтобы офлайн-движок был тестируем на фейке.
abstract class KvStore {
  Future<List<Map<String, dynamic>>?> readList(String key);
  Future<void> writeList(String key, List<Map<String, dynamic>> value);
}
