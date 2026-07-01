import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../api/trainer_medical.dart';
import '../widgets/trainer_nav_bar.dart';

const List<String> _ruMonths = <String>[
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

String _fmtDate(DateTime? d) =>
    d == null ? '' : '${d.day} ${_ruMonths[d.month - 1]} ${d.year}';

String _iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Медкарта клиента: список заметок (дата + текст + индикатор файла) и добавление.
/// Зеркало веб ClientMedicalPage (загрузка файла — P2, нужен нативный пикер).
class ClientMedicalScreen extends ConsumerStatefulWidget {
  const ClientMedicalScreen({super.key, required this.clientId, required this.clientName});
  final String clientId;
  final String clientName;

  @override
  ConsumerState<ClientMedicalScreen> createState() => _ClientMedicalScreenState();
}

class _ClientMedicalScreenState extends ConsumerState<ClientMedicalScreen> {
  final TextEditingController _note = TextEditingController();
  DateTime _date = DateTime.now();
  XFile? _file;
  bool _busy = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _pickFile() async {
    final XFile? picked = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1600, imageQuality: 85);
    if (picked != null) setState(() => _file = picked);
  }

  Future<void> _add() async {
    final String note = _note.text.trim();
    if (note.isEmpty || _busy) return;
    setState(() => _busy = true);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      await ref.read(trainerMedicalApiProvider).create(widget.clientId,
          date: _iso(_date), note: note, filePath: _file?.path, fileName: _file?.name);
      ref.invalidate(clientMedicalProvider(widget.clientId));
      if (!mounted) return;
      setState(() {
        _note.clear();
        _date = DateTime.now();
        _file = null;
        _busy = false;
      });
      FocusScope.of(context).unfocus();
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось добавить заметку')));
    }
  }

  Future<void> _delete(MedicalRecord r) async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Удалить запись?'),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: context.colors.danger),
            child: const Text('Удалить'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(trainerMedicalApiProvider).delete(widget.clientId, r.id);
      ref.invalidate(clientMedicalProvider(widget.clientId));
    } catch (_) {}
  }

  Future<void> _pickDate() async {
    final DateTime now = DateTime.now();
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 1),
    );
    if (picked != null) setState(() => _date = picked);
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final AsyncValue<List<MedicalRecord>> records = ref.watch(clientMedicalProvider(widget.clientId));

    return Scaffold(
      bottomNavigationBar: const TrainerNavBar(),
      appBar: AppBar(title: const Text('Мед.карта')),
      body: Column(
        children: <Widget>[
          Expanded(
            child: records.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (Object e, _) => Center(
                child: FilledButton(
                  onPressed: () => ref.invalidate(clientMedicalProvider(widget.clientId)),
                  child: const Text('Повторить'),
                ),
              ),
              data: (List<MedicalRecord> list) {
                if (list.isEmpty) {
                  return Center(child: Text('Записей пока нет', style: TextStyle(color: c.inkMuted)));
                }
                return ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  itemCount: list.length,
                  itemBuilder: (BuildContext ctx, int i) {
                    final MedicalRecord r = list[i];
                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
                      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Row(
                            children: <Widget>[
                              Text(_fmtDate(r.date),
                                  style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w600)),
                              const Spacer(),
                              GestureDetector(
                                onTap: () => _delete(r),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 6),
                                  child: Icon(Icons.delete_outline, size: 18, color: c.inkMuted),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(r.note, style: TextStyle(fontSize: 14, height: 1.35, color: c.ink)),
                          if (r.hasFile) ...<Widget>[
                            const SizedBox(height: 8),
                            Row(
                              children: <Widget>[
                                Icon(r.isImage ? Icons.image_outlined : Icons.attach_file,
                                    size: 15, color: c.inkMuted),
                                const SizedBox(width: 6),
                                Flexible(
                                  child: Text(r.fileName ?? 'Файл',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
          // Форма добавления.
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              decoration: BoxDecoration(
                color: c.bg,
                border: Border(top: BorderSide(color: c.line)),
              ),
              child: Column(
                children: <Widget>[
                  TextField(
                    controller: _note,
                    minLines: 1,
                    maxLines: 4,
                    maxLength: 4000,
                    decoration: InputDecoration(
                      hintText: 'Заметка: травмы, противопоказания, состояние…',
                      counterText: '',
                      filled: true,
                      fillColor: c.card,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: <Widget>[
                      GestureDetector(
                        onTap: _pickDate,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: <Widget>[
                              Icon(Icons.event, size: 16, color: c.inkMuted),
                              const SizedBox(width: 8),
                              Text(_fmtDate(_date), style: TextStyle(fontSize: 13, color: c.ink)),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: _pickFile,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                          decoration: BoxDecoration(
                            color: _file != null ? c.accent.withValues(alpha: 0.15) : c.card,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(_file != null ? Icons.check_circle : Icons.attach_file,
                              size: 18, color: _file != null ? c.accent : c.inkMuted),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: FilledButton(
                          onPressed: _busy ? null : _add,
                          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                          child: const Text('Добавить заметку'),
                        ),
                      ),
                    ],
                  ),
                  if (_file != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Row(
                        children: <Widget>[
                          Icon(Icons.image_outlined, size: 14, color: c.inkMuted),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(_file!.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
                          ),
                          GestureDetector(
                            onTap: () => setState(() => _file = null),
                            child: Icon(Icons.close, size: 16, color: c.inkMuted),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
