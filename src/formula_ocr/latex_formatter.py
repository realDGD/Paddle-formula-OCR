from __future__ import annotations

import re
from dataclasses import dataclass


STRUCTURED_ENVIRONMENTS = {
    "align",
    "align*",
    "aligned",
    "alignedat",
    "alignedat*",
    "array",
    "bmatrix",
    "Bmatrix",
    "cases",
    "dcases",
    "dcases*",
    "eqnarray",
    "eqnarray*",
    "gather",
    "gather*",
    "gathered",
    "matrix",
    "multline",
    "multline*",
    "pmatrix",
    "smallmatrix",
    "split",
    "subarray",
    "Vmatrix",
    "vmatrix",
}
ENVIRONMENT_ARGUMENT_COUNTS = {
    "alignedat": 1,
    "alignedat*": 1,
    "array": 1,
    "subarray": 1,
}
OPAQUE_COMMANDS = {
    r"\bbox",
    r"\ce",
    r"\colorbox",
    r"\fbox",
    r"\hbox",
    r"\href",
    r"\htmlClass",
    r"\htmlData",
    r"\htmlId",
    r"\htmlStyle",
    r"\mbox",
    r"\operatorname",
    r"\pu",
    r"\style",
    r"\text",
    r"\textbf",
    r"\textit",
    r"\textmd",
    r"\textnormal",
    r"\textrm",
    r"\textsf",
    r"\textsl",
    r"\texttt",
    r"\textup",
    r"\unicode",
    r"\url",
}
UNSAFE_COMMANDS = {
    r"\catcode",
    r"\char",
    r"\csname",
    r"\def",
    r"\edef",
    r"\futurelet",
    r"\gdef",
    r"\hskip",
    r"\kern",
    r"\let",
    r"\mathchar",
    r"\mkern",
    r"\newcommand",
    r"\renewcommand",
    r"\rule",
    r"\skip",
    r"\vskip",
    r"\xdef",
}
BINARY_COMMANDS = {
    r"\amalg",
    r"\ast",
    r"\bigcirc",
    r"\bigtriangledown",
    r"\bigtriangleup",
    r"\bullet",
    r"\cap",
    r"\cdot",
    r"\circ",
    r"\cup",
    r"\dagger",
    r"\ddagger",
    r"\diamond",
    r"\div",
    r"\lhd",
    r"\mp",
    r"\odot",
    r"\ominus",
    r"\oplus",
    r"\oslash",
    r"\otimes",
    r"\pm",
    r"\rhd",
    r"\setminus",
    r"\sqcap",
    r"\sqcup",
    r"\star",
    r"\times",
    r"\triangleleft",
    r"\triangleright",
    r"\unlhd",
    r"\unrhd",
    r"\uplus",
    r"\vee",
    r"\wedge",
    r"\wr",
}
RELATION_COMMANDS = {
    r"\approx",
    r"\asymp",
    r"\bowtie",
    r"\cong",
    r"\dashv",
    r"\doteq",
    r"\equiv",
    r"\ge",
    r"\geq",
    r"\gets",
    r"\gg",
    r"\hookleftarrow",
    r"\hookrightarrow",
    r"\iff",
    r"\in",
    r"\Join",
    r"\le",
    r"\leftarrow",
    r"\Leftrightarrow",
    r"\leftrightarrow",
    r"\leq",
    r"\ll",
    r"\longleftarrow",
    r"\Longleftarrow",
    r"\longleftrightarrow",
    r"\Longleftrightarrow",
    r"\longmapsto",
    r"\longrightarrow",
    r"\Longrightarrow",
    r"\mapsto",
    r"\mid",
    r"\models",
    r"\ne",
    r"\neq",
    r"\ni",
    r"\notin",
    r"\parallel",
    r"\perp",
    r"\prec",
    r"\preceq",
    r"\propto",
    r"\rightarrow",
    r"\Rightarrow",
    r"\rightleftharpoons",
    r"\sim",
    r"\simeq",
    r"\smile",
    r"\sqsubset",
    r"\sqsubseteq",
    r"\sqsupset",
    r"\sqsupseteq",
    r"\subset",
    r"\subseteq",
    r"\succ",
    r"\succeq",
    r"\supset",
    r"\supseteq",
    r"\to",
    r"\vdash",
}
FUNCTION_COMMANDS = {
    r"\arccos",
    r"\arcsin",
    r"\arctan",
    r"\arg",
    r"\cos",
    r"\cosh",
    r"\cot",
    r"\coth",
    r"\csc",
    r"\deg",
    r"\det",
    r"\dim",
    r"\exp",
    r"\gcd",
    r"\hom",
    r"\inf",
    r"\ker",
    r"\lg",
    r"\lim",
    r"\liminf",
    r"\limsup",
    r"\ln",
    r"\log",
    r"\max",
    r"\min",
    r"\Pr",
    r"\sec",
    r"\sin",
    r"\sinh",
    r"\sup",
    r"\tan",
    r"\tanh",
}
COMPACT_SPACING_COMMANDS = {r"\ ", r"\!", r"\,", r"\:", r"\;"}
WIDE_SPACING_COMMANDS = {r"\enspace", r"\quad", r"\qquad"}
DELIMITER_COMMANDS = {
    r"\Big",
    r"\Bigg",
    r"\Biggl",
    r"\Biggm",
    r"\Biggr",
    r"\Bigl",
    r"\Bigm",
    r"\Bigr",
    r"\big",
    r"\bigg",
    r"\biggl",
    r"\biggm",
    r"\biggr",
    r"\bigl",
    r"\bigm",
    r"\bigr",
    r"\left",
    r"\middle",
    r"\right",
}
ATTACHED_COMMAND_MODIFIERS = {r"\displaylimits", r"\limits", r"\nolimits"}


@dataclass(frozen=True)
class LatexFormatResult:
    source: str
    formatted: str
    changed: bool
    safe: bool
    status: str


@dataclass
class _Token:
    type: str
    value: str
    environment: str = ""
    whitespace_before: str = ""


@dataclass
class _Tokenization:
    tokens: list[_Token]
    has_comment: bool = False
    has_malformed_environment_header: bool = False
    has_unsupported_delimiter: bool = False
    has_unsafe_command: bool = False


def _is_control_word_character(character: str) -> bool:
    return bool(character) and (character.isascii() and (character.isalpha() or character == "@"))


def _read_command(source: str, start: int) -> tuple[str, int]:
    end = start + 1
    if end >= len(source):
        return "\\", end
    if _is_control_word_character(source[end]):
        end += 1
        while end < len(source) and _is_control_word_character(source[end]):
            end += 1
    else:
        end += 1
    return source[start:end], end


def _read_balanced_group(source: str, start: int) -> int | None:
    if start >= len(source) or source[start] != "{":
        return None
    depth = 0
    index = start
    while index < len(source):
        character = source[index]
        if character == "\\":
            _, index = _read_command(source, index)
            continue
        if character == "%":
            return None
        if character == "{":
            depth += 1
        elif character == "}":
            depth -= 1
            if depth == 0:
                return index + 1
        index += 1
    return None


def _read_environment(
    source: str,
    command: str,
    command_end: int,
) -> tuple[_Token, int, bool] | None:
    if command not in {r"\begin", r"\end"}:
        return None
    index = command_end
    while index < len(source) and source[index].isspace():
        index += 1
    if index >= len(source) or source[index] != "{":
        return None
    close = source.find("}", index + 1)
    if close < 0:
        return None
    name = source[index + 1 : close]
    if not re.fullmatch(r"[A-Za-z*]+", name):
        return None
    end = close + 1
    value = f"{command}{{{name}}}"
    missing_argument = False
    argument_count = ENVIRONMENT_ARGUMENT_COUNTS.get(name, 0) if command == r"\begin" else 0
    for _ in range(argument_count):
        group_start = end
        while group_start < len(source) and source[group_start].isspace():
            group_start += 1
        group_end = _read_balanced_group(source, group_start)
        if group_end is None:
            missing_argument = True
            break
        value += source[group_start:group_end]
        end = group_end
    token_type = "beginEnvironment" if command == r"\begin" else "endEnvironment"
    return _Token(token_type, value, environment=name), end, missing_argument


def _tokenize(source: str) -> _Tokenization:
    parsed = _Tokenization(tokens=[])
    index = 0
    while index < len(source):
        character = source[index]
        if character.isspace():
            end = index + 1
            while end < len(source) and source[end].isspace():
                end += 1
            parsed.tokens.append(_Token("whitespace", source[index:end]))
            index = end
            continue
        if character == "%":
            parsed.has_comment = True
            end = source.find("\n", index)
            end = len(source) if end < 0 else end + 1
            parsed.tokens.append(_Token("comment", source[index:end]))
            index = end
            continue
        if character == "$":
            parsed.has_unsupported_delimiter = True
            parsed.tokens.append(_Token("character", character))
            index += 1
            continue
        if character != "\\":
            parsed.tokens.append(_Token("character", character))
            index += 1
            continue

        command, command_end = _read_command(source, index)
        environment = _read_environment(source, command, command_end)
        if environment is not None:
            token, index, missing_argument = environment
            if missing_argument:
                parsed.has_malformed_environment_header = True
            parsed.tokens.append(token)
            continue
        if command == r"\verb" or command in UNSAFE_COMMANDS:
            parsed.has_unsafe_command = True

        opaque_command_end = command_end
        if (
            opaque_command_end < len(source)
            and source[opaque_command_end] == "*"
            and command in OPAQUE_COMMANDS
        ):
            opaque_command_end += 1
        if command in OPAQUE_COMMANDS:
            group_start = opaque_command_end
            while group_start < len(source) and source[group_start].isspace():
                group_start += 1
            group_end = _read_balanced_group(source, group_start)
            if group_end is not None:
                parsed.tokens.append(_Token("opaque", source[index:group_end]))
                index = group_end
                continue

        parsed.tokens.append(_Token("rowBreak" if command == r"\\" else "command", command))
        index = command_end
    return parsed


def _is_structurally_balanced(tokens: list[_Token]) -> bool:
    groups: list[str] = []
    environments: list[str] = []
    for token in tokens:
        if token.type == "opaque":
            continue
        if token.type == "character" and token.value == "{":
            groups.append(token.value)
        elif token.type == "character" and token.value == "}":
            if not groups:
                return False
            groups.pop()
        if token.type == "beginEnvironment":
            environments.append(token.environment)
        elif token.type == "endEnvironment":
            if not environments or environments.pop() != token.environment:
                return False
    return not groups and not environments


def _token_signature(tokens: list[_Token]) -> tuple[tuple[str, str], ...]:
    return tuple((token.type, token.value) for token in tokens if token.type != "whitespace")


def _is_character(token: _Token | None, values: set[str]) -> bool:
    return token is not None and token.type == "character" and token.value in values


def _is_opening_delimiter(token: _Token | None) -> bool:
    return _is_character(token, {"{", "[", "("})


def _is_closing_delimiter(token: _Token | None) -> bool:
    return _is_character(token, {"}", "]", ")"})


def _is_punctuation(token: _Token | None) -> bool:
    return _is_character(token, {",", ";", ":"})


def _is_script_marker(token: _Token | None) -> bool:
    return _is_character(token, {"_", "^"})


def _is_postfix(token: _Token | None) -> bool:
    return _is_character(token, {"!", "'"})


def _is_ampersand(token: _Token | None) -> bool:
    return _is_character(token, {"&"})


def _is_relation(token: _Token | None) -> bool:
    return (
        _is_character(token, {"=", "<", ">"})
        or token is not None
        and token.type == "command"
        and token.value in RELATION_COMMANDS
    )


def _is_compact_spacing(token: _Token | None) -> bool:
    return token is not None and token.type == "command" and token.value in COMPACT_SPACING_COMMANDS


def _is_wide_spacing(token: _Token | None) -> bool:
    return token is not None and token.type == "command" and token.value in WIDE_SPACING_COMMANDS


def _operator_role(token: _Token | None, previous: _Token | None) -> str:
    if token is not None and token.type == "command" and token.value in BINARY_COMMANDS:
        return "binary"
    if not _is_character(token, {"+", "-", "*", "/"}):
        return ""
    previous_is_operator = (
        previous is not None
        and previous.type == "command"
        and previous.value in BINARY_COMMANDS
    ) or _is_character(previous, {"+", "-", "*", "/"})
    unary = (
        previous is None
        or _is_opening_delimiter(previous)
        or _is_punctuation(previous)
        or _is_ampersand(previous)
        or _is_script_marker(previous)
        or previous.type == "rowBreak"
        or _is_relation(previous)
        or previous_is_operator
    )
    return "unary" if unary and token is not None and token.value in {"+", "-"} else "binary"


def _default_separator(
    previous: _Token,
    current: _Token,
    original_whitespace: str,
    previous_previous: _Token | None,
) -> str:
    current_role = _operator_role(current, previous)
    previous_role = _operator_role(previous, previous_previous)

    if _is_closing_delimiter(current) or _is_punctuation(current) or _is_postfix(current):
        return ""
    if _is_opening_delimiter(previous) or _is_script_marker(previous) or _is_script_marker(current):
        return ""
    if previous.type == "command" and previous.value in DELIMITER_COMMANDS:
        return ""
    if current.type == "command" and current.value in {r"\middle", r"\right"}:
        return ""
    if _is_compact_spacing(previous) or _is_compact_spacing(current):
        return ""
    if _is_wide_spacing(previous) or _is_wide_spacing(current):
        return " "
    if _is_ampersand(current):
        return " "
    if _is_ampersand(previous):
        return "" if _is_relation(current) else " "
    if _is_punctuation(previous):
        return "" if (
            _is_closing_delimiter(current)
            or _is_compact_spacing(current)
            or _is_wide_spacing(current)
        ) else " "
    if _is_relation(current) or _is_relation(previous):
        return " "
    if current_role == "binary" or previous_role == "binary":
        return " "
    if previous_role == "unary":
        return ""
    if (
        previous.type == "command"
        and previous.value in FUNCTION_COMMANDS
        and not _is_opening_delimiter(current)
    ):
        return " "
    if (
        current.type == "command"
        and current.value in FUNCTION_COMMANDS
        and not _is_opening_delimiter(previous)
    ):
        return " "
    if (
        previous.type == "command"
        and current.type == "command"
        and current.value not in ATTACHED_COMMAND_MODIFIERS
    ):
        return " "
    return " " if original_whitespace else ""


def _format_tokens(tokens: list[_Token]) -> str:
    significant: list[_Token] = []
    whitespace = ""
    for token in tokens:
        if token.type == "whitespace":
            whitespace += token.value
            continue
        significant.append(
            _Token(token.type, token.value, token.environment, whitespace_before=whitespace)
        )
        whitespace = ""

    output: list[str] = []
    structured_stack: list[str] = []
    for index, current in enumerate(significant):
        previous = significant[index - 1] if index > 0 else None
        previous_previous = significant[index - 2] if index > 1 else None
        separator = ""
        if previous is not None:
            closing_structured_environment = (
                current.type == "endEnvironment"
                and bool(structured_stack)
                and structured_stack[-1] == current.environment
            )
            after_structured_start = (
                previous.type == "beginEnvironment"
                and previous.environment in STRUCTURED_ENVIRONMENTS
            )
            after_structured_row = previous.type == "rowBreak" and bool(structured_stack)
            if closing_structured_environment:
                separator = f"\n{'  ' * max(0, len(structured_stack) - 1)}"
            elif after_structured_start or after_structured_row:
                separator = f"\n{'  ' * len(structured_stack)}"
            elif current.type == "rowBreak" and structured_stack:
                separator = " "
            else:
                separator = _default_separator(
                    previous,
                    current,
                    current.whitespace_before,
                    previous_previous,
                )
        output.extend((separator, current.value))
        if current.type == "beginEnvironment" and current.environment in STRUCTURED_ENVIRONMENTS:
            structured_stack.append(current.environment)
        elif (
            current.type == "endEnvironment"
            and structured_stack
            and structured_stack[-1] == current.environment
        ):
            structured_stack.pop()
    return "".join(output).strip()


def _unchanged(source: str, status: str) -> LatexFormatResult:
    return LatexFormatResult(source, source, False, False, status)


def format_latex_source(value: object) -> LatexFormatResult:
    source = "" if value is None else str(value)
    if not source.strip():
        formatted = source.strip()
        return LatexFormatResult(
            source,
            formatted,
            formatted != source,
            True,
            "formatted" if formatted != source else "unchanged",
        )
    if re.search(r"\\\\\s*\[", source):
        return _unchanged(source, "optional-row-spacing")

    parsed = _tokenize(source)
    if parsed.has_comment:
        return _unchanged(source, "comment-protected")
    if parsed.has_malformed_environment_header:
        return _unchanged(source, "malformed-environment-header")
    if parsed.has_unsupported_delimiter:
        return _unchanged(source, "delimiter-protected")
    if parsed.has_unsafe_command:
        return _unchanged(source, "unsafe-command")
    if not _is_structurally_balanced(parsed.tokens):
        return _unchanged(source, "unbalanced")

    formatted = _format_tokens(parsed.tokens)
    reparsed = _tokenize(formatted)
    if (
        reparsed.has_comment
        or reparsed.has_malformed_environment_header
        or reparsed.has_unsupported_delimiter
        or reparsed.has_unsafe_command
        or not _is_structurally_balanced(reparsed.tokens)
        or _token_signature(parsed.tokens) != _token_signature(reparsed.tokens)
    ):
        return _unchanged(source, "token-changed")
    return LatexFormatResult(
        source,
        formatted,
        formatted != source,
        True,
        "formatted" if formatted != source else "unchanged",
    )


def has_equivalent_tokens(left: object, right: object) -> bool:
    left_tokens = _tokenize("" if left is None else str(left))
    right_tokens = _tokenize("" if right is None else str(right))
    if (
        left_tokens.has_comment
        or right_tokens.has_comment
        or left_tokens.has_malformed_environment_header
        or right_tokens.has_malformed_environment_header
        or left_tokens.has_unsupported_delimiter
        or right_tokens.has_unsupported_delimiter
        or left_tokens.has_unsafe_command
        or right_tokens.has_unsafe_command
        or not _is_structurally_balanced(left_tokens.tokens)
        or not _is_structurally_balanced(right_tokens.tokens)
    ):
        return False
    return _token_signature(left_tokens.tokens) == _token_signature(right_tokens.tokens)
