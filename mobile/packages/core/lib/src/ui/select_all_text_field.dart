import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// [TextField], который при получении фокуса выделяет весь введённый текст —
/// чтобы значение можно было сразу перезаписать одним вводом (актуально для
/// числовых полей: повторы, вес, отдых, замеры и т.п.).
///
/// Выделение происходит именно при ПОЛУЧЕНИИ фокуса, а не на каждый тап:
/// первый тап выделяет всё, повторный тап внутри поля ставит курсор как обычно.
/// Это drop-in замена [TextField] с наиболее используемыми параметрами.
class SelectAllTextField extends StatefulWidget {
  const SelectAllTextField({
    super.key,
    required this.controller,
    this.focusNode,
    this.onChanged,
    this.onSubmitted,
    this.onTap,
    this.keyboardType,
    this.inputFormatters,
    this.textAlign = TextAlign.start,
    this.style,
    this.decoration = const InputDecoration(),
    this.maxLines = 1,
    this.minLines,
    this.textCapitalization = TextCapitalization.none,
    this.textInputAction,
    this.obscureText = false,
    this.autofocus = false,
    this.enabled,
    this.readOnly = false,
    this.maxLength,
    this.hintText,
    this.autocorrect = true,
    this.autofillHints,
  });

  final TextEditingController controller;
  final FocusNode? focusNode;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onTap;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final TextAlign textAlign;
  final TextStyle? style;
  final InputDecoration decoration;
  final int? maxLines;
  final int? minLines;
  final TextCapitalization textCapitalization;
  final TextInputAction? textInputAction;
  final bool obscureText;
  final bool autofocus;
  final bool? enabled;
  final bool readOnly;
  final int? maxLength;
  final String? hintText;
  final bool autocorrect;
  final Iterable<String>? autofillHints;

  @override
  State<SelectAllTextField> createState() => _SelectAllTextFieldState();
}

class _SelectAllTextFieldState extends State<SelectAllTextField> {
  FocusNode? _internal;
  FocusNode get _node => widget.focusNode ?? (_internal ??= FocusNode());

  @override
  void initState() {
    super.initState();
    _node.addListener(_onFocusChange);
  }

  @override
  void didUpdateWidget(SelectAllTextField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.focusNode != widget.focusNode) {
      (oldWidget.focusNode ?? _internal)?.removeListener(_onFocusChange);
      _node.addListener(_onFocusChange);
    }
  }

  void _onFocusChange() {
    if (!_node.hasFocus) return;
    final String text = widget.controller.text;
    if (text.isEmpty) return;
    // Откладываем на кадр: к моменту фокуса контроллер уже проставляет курсор,
    // и без этого выделение может сброситься.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_node.hasFocus) return;
      widget.controller.selection =
          TextSelection(baseOffset: 0, extentOffset: widget.controller.text.length);
    });
  }

  @override
  void dispose() {
    _node.removeListener(_onFocusChange);
    _internal?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final InputDecoration dec = widget.hintText != null
        ? widget.decoration.copyWith(hintText: widget.hintText)
        : widget.decoration;
    return TextField(
      controller: widget.controller,
      focusNode: _node,
      onChanged: widget.onChanged,
      onSubmitted: widget.onSubmitted,
      onTap: widget.onTap,
      keyboardType: widget.keyboardType,
      inputFormatters: widget.inputFormatters,
      textAlign: widget.textAlign,
      style: widget.style,
      decoration: dec,
      maxLines: widget.maxLines,
      minLines: widget.minLines,
      textCapitalization: widget.textCapitalization,
      textInputAction: widget.textInputAction,
      obscureText: widget.obscureText,
      autofocus: widget.autofocus,
      enabled: widget.enabled,
      readOnly: widget.readOnly,
      maxLength: widget.maxLength,
      autocorrect: widget.autocorrect,
      autofillHints: widget.autofillHints,
    );
  }
}
