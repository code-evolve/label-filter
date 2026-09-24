# Copyright 2026 Steven Spungin
#
# Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

"""
The label filter pattern language — ``docs/syntax.md``.

**Parsed into a small IR, never compiled to a regex.** The language stays small and deterministic,
and no regex engine's implementation details leak into it.

Six reserved characters, and nothing else is special: ``*`` ``|`` ``` ` ``` ``\\`` ``[`` ``]``.

This port mirrors the TypeScript implementation function for function, deliberately: the two are
meant to be readable side by side, and both are held to ``conformance/cases.json``.
"""

from __future__ import annotations

from typing import Callable, List, Optional, Sequence, Tuple

__all__ = ["compile_label_filter", "parse_pattern", "Matcher", "ParsedPattern"]

#: Groups multiply, so an alternative is capped rather than allowed to explode on a keystroke.
MAX_SEQUENCES = 64

#: Every instruction ``\\…\\`` accepts: ``c`` case-sensitive, ``-`` not, ``b`` word boundary.
#:
#: ``\\…\\`` is the instruction namespace: a section of letters, digits and ``-`` is read as one and
#: refused when it names nothing, which is what makes a future instruction addable without changing
#: any pattern that works. It claims no punctuation — ``\\.foo\\.bar`` is a literal and stays one.
INSTRUCTIONS = "c-b"

LIT, ANY, SET, GROUP = "lit", "any", "set", "group"


#: The only escapes a set body accepts: a backslash, a closing bracket, and a dash.
#:
#: **Everything else inside a set is already a literal, so an escape there can only be a reader
#: expecting a regular expression** — and ``[\n]`` quietly meaning the letter ``n`` is the silent
#: misread this language refuses elsewhere. Ruled 2026-09-23.
ESCAPE_ERROR = (
    "a letter or digit cannot be escaped — \\d, \\n and \\b mean a class in a regular expression "
    "and nothing here; drop the backslash, or use \\c\\ \\-\\ \\b\\ at the start for an option"
)


def _escapable(ch: str) -> bool:
    """A backslash may escape anything except an ASCII letter or digit."""
    return not (ch.isascii() and ch.isalnum())


def _set_escape_error(body: str) -> Optional[str]:
    i = 0
    while i < len(body):
        if body[i] != "\\":
            i += 1
            continue
        nxt = body[i + 1] if i + 1 < len(body) else None
        if nxt is None or not _escapable(nxt):
            return ESCAPE_ERROR
        i += 2
    return None


def _charset_test(body: str) -> Callable[[str], bool]:
    """A set body — ``123``, ``0-9``, ``A-Za-z`` — as a membership test.

    **Ranges are expanded by code point, and a leading or trailing ``-`` is a literal.** An escaped
    ``-`` is always a literal too: ``[a\\-z]`` is three characters, not a range.
    """
    atoms: List[Tuple[str, bool]] = []
    i = 0
    while i < len(body):
        if body[i] == "\\" and i + 1 < len(body):
            atoms.append((body[i + 1], True))
            i += 2
        else:
            atoms.append((body[i], False))
            i += 1

    singles = set()
    ranges: List[Tuple[int, int]] = []
    i = 0
    while i < len(atoms):
        dash = atoms[i + 1] if i + 1 < len(atoms) else None
        upper = atoms[i + 2] if i + 2 < len(atoms) else None
        if dash and not dash[1] and dash[0] == "-" and upper:
            ranges.append((ord(atoms[i][0]), ord(upper[0])))
            i += 3
        else:
            singles.add(atoms[i][0])
            i += 1

    def test(ch: str) -> bool:
        if ch in singles:
            return True
        c = ord(ch)
        return any(lo <= c <= hi for lo, hi in ranges)

    return test


def _fold_char(ch: str) -> str:
    """Lower-case one character, but **only when doing so keeps its length**.

    Case folding is not length-preserving in general (``İ`` lowercases to two characters), and the
    matcher walks the folded text and the raw text at the SAME index — a literal reads the folded
    one, a set and the boundary test read the raw one.
    """
    lower = ch.lower()
    return lower if len(lower) == len(ch) else ch


def _fold(s: str) -> str:
    return "".join(_fold_char(c) for c in s)


def _has_bar_run(s: str) -> bool:
    """Whether any run of unescaped ``|`` is three or more long.

    **This one rule is what makes ``||`` decidable**, and it is also what makes an empty group and an
    empty branch unwritable.
    """
    run = 0
    i = 0
    while i < len(s):
        if s[i] == "\\":
            i += 2
            run = 0
            continue
        if s[i] == "|":
            run += 1
            if run > 2:
                return True
        else:
            run = 0
        i += 1
    return False


def _split_alternatives(s: str) -> Tuple[List[str], bool]:
    """Split on ``|`` at the top level, leaving the ``|`` inside a group alone.

    ``||`` toggles, which is also why a group cannot nest: the middle ``||`` of ``||a||b||`` closes
    rather than opens, so what follows is a second group left hanging.
    """
    alts: List[str] = []
    cur: List[str] = []
    in_group = False
    i = 0
    while i < len(s):
        ch = s[i]
        if ch == "\\" and i + 1 < len(s):
            cur.append(ch)
            cur.append(s[i + 1])
            i += 2
            continue
        if ch == "|" and i + 1 < len(s) and s[i + 1] == "|":
            in_group = not in_group
            cur.append("||")
            i += 2
            continue
        if ch == "|" and not in_group:
            alts.append("".join(cur))
            cur = []
            i += 1
            continue
        cur.append(ch)
        i += 1
    alts.append("".join(cur))
    return alts, in_group


def _ends_with_anchor(s: str) -> bool:
    """Whether the last character is an unescaped backtick — the end anchor."""
    i = 0
    while i < len(s):
        if s[i] == "\\":
            i += 2
            continue
        if s[i] == "`" and i == len(s) - 1:
            return True
        i += 1
    return False


def _find_unescaped(s: str, start: int, ch: str) -> int:
    i = start
    while i < len(s):
        if s[i] == "\\":
            i += 2
            continue
        if s[i] == ch:
            return i
        i += 1
    return -1


def _find_group_close(s: str, start: int) -> int:
    i = start
    while i < len(s):
        if s[i] == "\\":
            i += 2
            continue
        if s[i] == "|" and i + 1 < len(s) and s[i + 1] == "|":
            return i
        i += 1
    return -1


def _split_branches(s: str) -> List[str]:
    """Split a group body on its single ``|`` — it can hold no ``||``, since the first one closed it."""
    out: List[str] = []
    cur: List[str] = []
    i = 0
    while i < len(s):
        if s[i] == "\\" and i + 1 < len(s):
            cur.append(s[i])
            cur.append(s[i + 1])
            i += 2
            continue
        if s[i] == "|":
            out.append("".join(cur))
            cur = []
            i += 1
            continue
        cur.append(s[i])
        i += 1
    out.append("".join(cur))
    return out


def _tokenise(s: str):
    """Returns ``(tokens, error)``. A token is ``(kind, payload)``."""
    out: List[tuple] = []
    lit: List[str] = []

    def flush():
        if lit:
            out.append((LIT, "".join(lit)))
            lit.clear()

    i = 0
    while i < len(s):
        ch = s[i]
        if ch == "\\" and i + 1 < len(s):
            if not _escapable(s[i + 1]):
                flush()
                return out, ESCAPE_ERROR
            lit.append(s[i + 1])
            i += 2
            continue
        if ch == "*":
            flush()
            out.append((ANY, None))
            i += 1
            continue
        if ch == "|" and i + 1 < len(s) and s[i + 1] == "|":
            close = _find_group_close(s, i + 2)
            if close == -1:
                flush()
                return out, "unclosed || group — a group is ||…||, and a literal bar is \\|"
            branches = []
            for branch in _split_branches(s[i + 2 : close]):
                if branch == "":
                    flush()
                    return out, "empty alternative inside a || group"
                sub, err = _tokenise(branch)
                if err:
                    flush()
                    return out, err
                # **A branch cannot hold a group**: the first unescaped ``||`` after the opener
                # closes this one, so the body was bounded before any nested opener could be read.
                branches.append(sub)
            flush()
            out.append((GROUP, branches))
            i = close + 2
            continue
        if ch == "[":
            close = _find_unescaped(s, i + 1, "]")
            if close == -1:
                flush()
                return out, "unclosed [ — a set is […], and a literal bracket is \\["
            body = s[i + 1 : close]
            # **An empty set can never match, so it is refused rather than served.**
            if body == "":
                flush()
                return out, "empty set [] — a set needs characters, and a literal bracket is \\["
            bad = _set_escape_error(body)
            if bad:
                flush()
                return out, bad
            flush()
            out.append((SET, _charset_test(body)))
            i = close + 1
            continue
        if ch == "]":
            flush()
            return out, "unmatched ] — a set is […], and a literal bracket is \\]"
        # Anchors were taken off both ends already, so anything left is in the middle.
        if ch == "`":
            flush()
            return (
                out,
                "a backtick is an anchor and belongs at the very start or very end — a literal backtick is \\`",
            )
        lit.append(ch)
        i += 1
    flush()
    return out, None


def _expand(tokens):
    """Desugar groups: one token list in, one list per combination out."""
    seqs = [[]]
    for kind, payload in tokens:
        if kind != GROUP:
            seqs = [seq + [(kind, payload)] for seq in seqs]
            continue
        nxt = []
        for seq in seqs:
            for branch in payload:
                nxt.append(seq + list(branch))
        if len(nxt) > MAX_SEQUENCES:
            return None, (
                f"too many combinations — || groups multiply, and this is over {MAX_SEQUENCES}; "
                "use separate filters"
            )
        seqs = nxt
    return seqs, None


class ParsedPattern:
    """The parsed form, for a caller that wants to inspect or render a pattern."""

    __slots__ = ("case_sensitive", "negate", "boundary", "alts", "error")

    def __init__(self, case_sensitive, negate, boundary, alts, error):
        self.case_sensitive = case_sensitive
        self.negate = negate
        self.boundary = boundary
        self.alts = alts
        self.error = error


def _parse_alternative(src: str):
    """One alternative: optional start anchor, tokens, optional end anchor.

    **Both anchors are stripped here, and a backtick anywhere else is an error.** Since sets moved to
    ``[…]`` there is nothing else a backtick can be, so this needs no pairing and no parity.
    """
    s = src
    start = end = False
    if s.startswith("`"):
        start = True
        s = s[1:]
    if _ends_with_anchor(s):
        end = True
        s = s[:-1]
    tokens, err = _tokenise(s)
    if err:
        return {"start": start, "end": end, "seqs": [[]], "error": err}
    seqs, err = _expand(tokens)
    if err:
        return {"start": start, "end": end, "seqs": [[]], "error": err}
    return {"start": start, "end": end, "seqs": seqs, "error": None}


def parse_pattern(pattern: str) -> ParsedPattern:
    """Parse a pattern without compiling it."""
    rest = str(pattern)
    case_sensitive = negate = boundary = False
    option_error = None

    # ``\options\...`` — only when a SECOND unescaped backslash exists, and only with at least one
    # option character. ``\\`` is an escaped backslash, NOT an empty option section.
    if rest.startswith("\\"):
        end_i = rest.find("\\", 1)
        if end_i > 0:
            opts = rest[1:end_i]
            if opts and all(c.isascii() and (c.isalnum() or c == "-") for c in opts):
                unknown = "".join(c for c in opts if c not in INSTRUCTIONS)
                if unknown:
                    option_error = (
                        f"unknown instruction {unknown} — the instructions are c (case-sensitive), "
                        "- (not) and b (word boundary); a literal backslash is \\\\"
                    )
                case_sensitive = "c" in opts
                negate = "-" in opts
                boundary = "b" in opts
                rest = rest[end_i + 1 :]

    sources, unclosed = _split_alternatives(rest)
    parsed = [_parse_alternative(a) for a in sources]

    if option_error:
        error = option_error
    elif _has_bar_run(rest):
        error = (
            "three or more | in a row — | separates alternatives, || opens or closes a group, "
            "and a literal bar is \\|"
        )
    elif unclosed:
        error = "unclosed || group — a group is ||…||, it does not nest, and a literal bar is \\|"
    else:
        error = next((a["error"] for a in parsed if a["error"]), None)

    # **The trap that groups exist to replace.** ``​`a|b`​`` reads to everyone as "exactly a or b",
    # and parses as "starts with a" OR "ends with b".
    if not error and len(parsed) > 1:
        first, last = parsed[0], parsed[-1]
        if first["start"] and not first["end"] and last["end"] and not last["start"]:
            error = (
                'anchors bind to one alternative, not across | — `a|b` reads as "starts with a" '
                'OR "ends with b"; write `||a|b||` for exactly one of them'
            )

    # **Negation with nothing to negate hides every row** — the confident empty, reached from the
    # other side, and the state ``\-\…`` passes through while it is being typed.
    if not error and negate and all(
        not a["start"] and not a["end"] and all(len(s) == 0 for s in a["seqs"]) for a in parsed
    ):
        error = "negation with no pattern would hide every row — give \\-\\ something to exclude"

    alts = []
    for a in parsed:
        for seq in a["seqs"]:
            tokens = seq
            if not case_sensitive:
                tokens = [
                    (LIT, _fold(payload)) if kind == LIT else (kind, payload)
                    for kind, payload in seq
                ]
            alts.append({"start": a["start"], "end": a["end"], "tokens": tokens})

    return ParsedPattern(case_sensitive, negate, boundary, alts, error)


def _is_alnum(ch: str) -> bool:
    return ch.isalpha() or ch.isdigit()


def _starts_at_boundary(raw: str, at: int) -> bool:
    return at == 0 or not _is_alnum(raw[at - 1])


def _ends_at_boundary(raw: str, at: int) -> bool:
    return at == len(raw) or not _is_alnum(raw[at])


def _match_at(tokens, ti, raw, text, boundary, at, must_end, failed, width) -> bool:
    """**``failed`` is not an optimisation, it is what keeps this from hanging the UI.**

    Backtracking over ``*`` is exponential without it: ``*a*a*a*a*a*z`` against 80 ``a``s took 25
    seconds for ONE label in the TypeScript implementation before this table was added.
    """
    if ti == len(tokens):
        if must_end:
            return at == len(text)
        return not boundary or _ends_at_boundary(raw, at)
    key = ti * width + at
    if failed[key]:
        return False
    kind, payload = tokens[ti]
    ok = False
    if kind == LIT:
        ok = text.startswith(payload, at) and _match_at(
            tokens, ti + 1, raw, text, boundary, at + len(payload), must_end, failed, width
        )
    elif kind == SET:
        # **A set is always case-sensitive, so it reads the raw label.**
        ok = at < len(raw) and payload(raw[at]) and _match_at(
            tokens, ti + 1, raw, text, boundary, at + 1, must_end, failed, width
        )
    else:
        # ANY — zero or more, shortest first.
        for j in range(at, len(text) + 1):
            if _match_at(tokens, ti + 1, raw, text, boundary, j, must_end, failed, width):
                ok = True
                break
    if not ok:
        failed[key] = True
    return ok


def _match_alternative(alt, raw, text, boundary) -> bool:
    width = len(text) + 1
    failed = [False] * (len(alt["tokens"]) * width)
    if alt["start"]:
        return _match_at(
            alt["tokens"], 0, raw, text, boundary, 0, alt["end"], failed, width
        )
    # Unanchored: ``foo`` is conceptually ``*foo*``.
    for i in range(len(text) + 1):
        if boundary and not _starts_at_boundary(raw, i):
            continue
        if _match_at(alt["tokens"], 0, raw, text, boundary, i, alt["end"], failed, width):
            return True
    return False


class Matcher:
    """A compiled matcher.

    **When ``error`` is set, the matcher answers ``True`` for every label**, so an unreadable pattern
    hides nothing and the caller can show the reason. This holds under ``\\-\\`` as well: negation
    never inverts a refusal.
    """

    __slots__ = ("error", "_parsed")

    def __init__(self, parsed: ParsedPattern):
        self._parsed = parsed
        self.error: Optional[str] = parsed.error

    def __call__(self, label) -> bool:
        if self.error:
            return True
        p = self._parsed
        raw = "" if label is None else str(label)
        text = raw if p.case_sensitive else _fold(raw)
        hit = any(_match_alternative(a, raw, text, p.boundary) for a in p.alts)
        return (not hit) if p.negate else hit


def compile_label_filter(pattern: str) -> Matcher:
    """Compile a pattern once into a callable that answers ``bool`` for a label."""
    return Matcher(parse_pattern(pattern))
