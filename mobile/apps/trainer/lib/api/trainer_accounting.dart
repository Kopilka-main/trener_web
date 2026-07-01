import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Доход. Для синтетических строк-пакетов (id начинается с `pkg:`) заполнены
/// title (тип тренировки) и subtitle (напр. «20 трен.»).
class Income {
  Income({
    required this.id,
    required this.category,
    required this.amount,
    required this.date,
    required this.clientId,
    required this.note,
    required this.tags,
    required this.title,
    required this.subtitle,
  });
  final String id;
  final String category;
  final num amount;
  final DateTime? date;
  final String? clientId;
  final String? note;
  final List<String> tags;
  final String? title;
  final String? subtitle;

  bool get isPackage => id.startsWith('pkg:');

  factory Income.fromJson(Map<String, dynamic> j) => Income(
        id: j['id'] as String? ?? '',
        category: j['category'] as String? ?? '',
        amount: (j['amount'] as num?) ?? 0,
        date: DateTime.tryParse(j['date'] as String? ?? ''),
        clientId: j['clientId'] as String?,
        note: j['note'] as String?,
        tags: ((j['tags'] as List<dynamic>?) ?? <dynamic>[]).map((dynamic e) => e.toString()).toList(),
        title: j['title'] as String?,
        subtitle: j['subtitle'] as String?,
      );
}

/// Расход.
class Expense {
  Expense({
    required this.id,
    required this.category,
    required this.amount,
    required this.date,
    required this.clientId,
    required this.note,
    required this.tags,
  });
  final String id;
  final String category;
  final num amount;
  final DateTime? date;
  final String? clientId;
  final String? note;
  final List<String> tags;

  factory Expense.fromJson(Map<String, dynamic> j) => Expense(
        id: j['id'] as String? ?? '',
        category: j['category'] as String? ?? '',
        amount: (j['amount'] as num?) ?? 0,
        date: DateTime.tryParse(j['date'] as String? ?? ''),
        clientId: j['clientId'] as String?,
        note: j['note'] as String?,
        tags: ((j['tags'] as List<dynamic>?) ?? <dynamic>[]).map((dynamic e) => e.toString()).toList(),
      );
}

class AccountingSummary {
  AccountingSummary({required this.totalIncome, required this.totalExpense, required this.balance});
  final num totalIncome;
  final num totalExpense;
  final num balance;

  factory AccountingSummary.fromJson(Map<String, dynamic> j) => AccountingSummary(
        totalIncome: (j['totalIncome'] as num?) ?? 0,
        totalExpense: (j['totalExpense'] as num?) ?? 0,
        balance: (j['balance'] as num?) ?? 0,
      );
}

class TrainerAccountingApi {
  TrainerAccountingApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<AccountingSummary> summary(String from, String to) async {
    final Map<String, dynamic> r = await _api.getJson('/api/accounting/summary?from=$from&to=$to');
    return AccountingSummary.fromJson(r);
  }

  Future<List<Income>> incomes() async {
    final Map<String, dynamic> r = await _api.getJson('/api/incomes');
    return ((r['incomes'] as List<dynamic>?) ?? <dynamic>[])
        .cast<Map<String, dynamic>>()
        .map(Income.fromJson)
        .toList();
  }

  Future<List<Expense>> expenses() async {
    final Map<String, dynamic> r = await _api.getJson('/api/expenses');
    return ((r['expenses'] as List<dynamic>?) ?? <dynamic>[])
        .cast<Map<String, dynamic>>()
        .map(Expense.fromJson)
        .toList();
  }

  Future<void> createIncome(Map<String, dynamic> body) async {
    await _api.postJson('/api/incomes', body);
  }

  Future<void> updateIncome(String id, Map<String, dynamic> body) async {
    await _api.patchJson('/api/incomes/$id', body);
  }

  Future<void> deleteIncome(String id) async {
    await _api.deleteJson('/api/incomes/$id');
  }

  Future<void> createExpense(Map<String, dynamic> body) async {
    await _api.postJson('/api/expenses', body);
  }

  Future<void> updateExpense(String id, Map<String, dynamic> body) async {
    await _api.patchJson('/api/expenses/$id', body);
  }

  Future<void> deleteExpense(String id) async {
    await _api.deleteJson('/api/expenses/$id');
  }
}

final Provider<TrainerAccountingApi> trainerAccountingApiProvider =
    Provider<TrainerAccountingApi>((ref) => TrainerAccountingApi(ref));

final FutureProvider<List<Income>> trainerIncomesProvider =
    FutureProvider<List<Income>>((ref) => ref.read(trainerAccountingApiProvider).incomes());

final FutureProvider<List<Expense>> trainerExpensesProvider =
    FutureProvider<List<Expense>>((ref) => ref.read(trainerAccountingApiProvider).expenses());
