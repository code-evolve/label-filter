<?php
/*
Copyright 2026 Steven Spungin

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

declare(strict_types=1);

namespace CodeEvolve\LabelFilter;

/**
 * The label filter pattern language — docs/syntax.md.
 *
 * **Parsed into a small IR, never compiled to a regex.** The language stays small and deterministic,
 * and no regex engine's implementation details leak into it. PHP has PCRE in the box, which makes
 * this the port where that promise is most worth stating.
 *
 * Six reserved characters, and nothing else is special: * | ` \ [ ]
 *
 * Strings are handled as arrays of UTF-8 characters, because every index in this algorithm is a
 * character index: `mb_str_split` once at the edges, never `strlen` in the middle.
 */
final class LabelFilter
{
    /** Groups multiply, so an alternative is capped rather than allowed to explode on a keystroke. */
    private const MAX_SEQUENCES = 64;

    /**
     * Every instruction \…\ accepts: c case-sensitive, - not, b word boundary.
     *
     * \…\ is the instruction namespace: a section of letters, digits and - is read as one and
     * refused when it names nothing, which is what makes a future instruction addable without
     * changing any pattern that works. It claims no punctuation — `\.foo\.bar` is a literal.
     */
    private const INSTRUCTIONS = 'c-b';

    /** The one refusal, shared by the pattern body and a set body. */
    private const ESCAPE_ERROR = 'a letter or digit cannot be escaped — \\d, \\n and \\b mean a class in a regular expression and nothing here; drop the backslash, or use \\c\\ \\-\\ \\b\\ at the start for an option';

    /** A backslash may escape anything except an ASCII letter or digit. */
    private static function escapable(string $ch): bool
    {
        return !preg_match('/^[A-Za-z0-9]$/', $ch);
    }

    private const LIT = 'lit';
    private const ANY = 'any';
    private const SET = 'set';
    private const GROUP = 'group';

    /** @var string|null Why the pattern could not be read, if it could not be. */
    public $error = null;

    private $caseSensitive = false;
    private $negate = false;
    private $boundary = false;
    /** @var array<int, array{start: bool, end: bool, tokens: array}> */
    private $alts = [];

    private function __construct()
    {
    }

    /** Compile a pattern once into a matcher. */
    public static function compile(string $pattern): self
    {
        $m = new self();
        $rest = self::chars($pattern);
        $optionError = null;

        // \options\... — only when a SECOND unescaped backslash exists, and only with at least one
        // option character. \\ is an escaped backslash, NOT an empty option section.
        if (($rest[0] ?? null) === '\\') {
            $end = -1;
            for ($i = 1; $i < count($rest); $i++) {
                if ($rest[$i] === '\\') { $end = $i; break; }
            }
            if ($end > 0) {
                $opts = array_slice($rest, 1, $end - 1);
                $ok = count($opts) > 0;
                foreach ($opts as $c) {
                    if (!preg_match('/^[A-Za-z0-9-]$/', $c)) { $ok = false; }
                }
                if ($ok) {
                    $unknown = '';
                    foreach ($opts as $c) {
                        if (strpos(self::INSTRUCTIONS, $c) === false) { $unknown .= $c; }
                    }
                    if ($unknown !== '') {
                        $optionError = "unknown instruction {$unknown} — the instructions are c (case-sensitive), - (not) and b (word boundary); a literal backslash is \\\\";
                    }
                    $m->caseSensitive = in_array('c', $opts, true);
                    $m->negate = in_array('-', $opts, true);
                    $m->boundary = in_array('b', $opts, true);
                    $rest = array_slice($rest, $end + 1);
                }
            }
        }

        [$sources, $unclosed] = self::splitAlternatives($rest);
        $parsed = array_map([self::class, 'parseAlternative'], $sources);

        // An option section that is NOT the prefix: $rest already had the real one removed, so
        // anything still shaped like one sits in a later alternative or after a first prefix.
        $misplaced = null;
        foreach ($sources as $src) {
            $found = self::leadingOptionSection($src);
            if ($found !== null) { $misplaced = $found; break; }
        }

        if ($optionError !== null) {
            $m->error = $optionError;
        } elseif ($misplaced !== null) {
            $m->error = "\\{$misplaced}\\ applies to the whole pattern, so it cannot open an alternative — move it to the very start, before the first |";
        } elseif (self::hasBarRun($rest)) {
            $m->error = 'three or more | in a row — | separates alternatives, || opens or closes a group, and a literal bar is \\|';
        } elseif ($unclosed) {
            $m->error = 'unclosed || group — a group is ||…||, it does not nest, and a literal bar is \\|';
        } else {
            foreach ($parsed as $a) {
                if ($a['error'] !== null) { $m->error = $a['error']; break; }
            }
        }

        // The trap that groups exist to replace: `a|b` reads as "exactly a or b" and parses as
        // "starts with a" OR "ends with b".
        if ($m->error === null && count($parsed) > 1) {
            $first = $parsed[0];
            $last = $parsed[count($parsed) - 1];
            if ($first['start'] && !$first['end'] && $last['end'] && !$last['start']) {
                $m->error = 'anchors bind to one alternative, not across | — `a|b` reads as "starts with a" OR "ends with b"; write `||a|b||` for exactly one of them';
            }
        }

        // Negation with nothing to negate hides every row — the confident empty, reached from the
        // other side, and the state \-\… passes through while it is being typed.
        if ($m->error === null && $m->negate) {
            $empty = true;
            foreach ($parsed as $a) {
                if ($a['start'] || $a['end']) { $empty = false; break; }
                foreach ($a['seqs'] as $seq) {
                    if (count($seq) > 0) { $empty = false; }
                }
            }
            if ($empty) {
                $m->error = 'negation with no pattern would hide every row — give \\-\\ something to exclude';
            }
        }

        foreach ($parsed as $a) {
            foreach ($a['seqs'] as $seq) {
                $tokens = $seq;
                // A literal folds; a set never does, so only the literals are lowered here.
                if (!$m->caseSensitive) {
                    foreach ($tokens as $i => $t) {
                        if ($t[0] === self::LIT) {
                            $tokens[$i] = [self::LIT, self::foldChars($t[1])];
                        }
                    }
                }
                $m->alts[] = ['start' => $a['start'], 'end' => $a['end'], 'tokens' => $tokens];
            }
        }
        return $m;
    }

    /** Whether one label passes the filter. */
    public function matches(string $label): bool
    {
        // An unparseable pattern hides nothing, and \-\ does not get to invert that.
        if ($this->error !== null) {
            return true;
        }
        $raw = self::chars($label);
        $text = $this->caseSensitive ? $raw : self::foldChars($raw);
        $hit = false;
        foreach ($this->alts as $alt) {
            if ($this->matchAlternative($alt, $raw, $text)) { $hit = true; break; }
        }
        return $this->negate ? !$hit : $hit;
    }

    /** @return string[] */
    private static function chars(string $s): array
    {
        if ($s === '') { return []; }
        return preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    }

    /**
     * Lower-case one character, but **only when doing so keeps its length**.
     *
     * Case folding is not length-preserving in general (İ lowercases to two characters), and the
     * matcher walks the folded text and the raw text at the SAME index.
     */
    private static function foldChar(string $ch): string
    {
        $lower = mb_strtolower($ch, 'UTF-8');
        return mb_strlen($lower, 'UTF-8') === mb_strlen($ch, 'UTF-8') ? $lower : $ch;
    }

    /** @param string[] $in @return string[] */
    private static function foldChars(array $in): array
    {
        return array_map([self::class, 'foldChar'], $in);
    }

    /**
     * Definition B of a word boundary: the edge of the label, or a neighbouring character that is
     * not a letter or a number. A regex's own \b counts _ as a word character, which is wrong here.
     */
    private static function isAlnum(string $ch): bool
    {
        return (bool) preg_match('/^[\p{L}\p{N}]$/u', $ch);
    }

    /**
     * The only escapes a set body accepts: a backslash, a closing bracket, and a dash.
     *
     * Everything else inside a set is already a literal, so an escape there can only be a reader
     * expecting a regular expression — and `[\n]` quietly meaning the letter `n` is the silent
     * misread this language refuses elsewhere. Ruled 2026-09-23.
     *
     * @param string[] $body
     */
    private static function setEscapeError(array $body): ?string
    {
        for ($i = 0; $i < count($body); ) {
            if ($body[$i] !== '\\') { $i++; continue; }
            $next = $body[$i + 1] ?? null;
            if ($next === null || !self::escapable($next)) {
                return self::ESCAPE_ERROR;
            }
            $i += 2;
        }
        return null;
    }

    /** @param string[] $body @return array{0: array<string,bool>, 1: array<int, array{0:int,1:int}>} */
    private static function parseCharSet(array $body): array
    {
        $atoms = [];
        for ($i = 0; $i < count($body); ) {
            if ($body[$i] === '\\' && $i + 1 < count($body)) {
                $atoms[] = [$body[$i + 1], true];
                $i += 2;
                continue;
            }
            $atoms[] = [$body[$i], false];
            $i++;
        }
        $singles = [];
        $ranges = [];
        for ($i = 0; $i < count($atoms); ) {
            $dash = $atoms[$i + 1] ?? null;
            $upper = $atoms[$i + 2] ?? null;
            if ($dash !== null && !$dash[1] && $dash[0] === '-' && $upper !== null) {
                $ranges[] = [self::ord($atoms[$i][0]), self::ord($upper[0])];
                $i += 3;
                continue;
            }
            $singles[$atoms[$i][0]] = true;
            $i++;
        }
        return [$singles, $ranges];
    }

    private static function ord(string $ch): int
    {
        $cp = unpack('N', mb_convert_encoding($ch, 'UCS-4BE', 'UTF-8'));
        return $cp[1];
    }

    private static function setTest(array $set, string $ch): bool
    {
        [$singles, $ranges] = $set;
        if (isset($singles[$ch])) { return true; }
        $c = self::ord($ch);
        foreach ($ranges as [$lo, $hi]) {
            if ($c >= $lo && $c <= $hi) { return true; }
        }
        return false;
    }

    /**
     * An option section at the start of an alternative, which is never what it looks like.
     *
     * Options are global: the prefix is read once, off the whole pattern, before it is split on |,
     * so apple|\-\pear cannot mean "contains apple OR not pear". Refused 2026-09-24 for the same
     * reason `a|b` is refused: it parses cleanly and answers a different question. See the
     * TypeScript implementation for why only - still reached this point.
     * @param string[] $alt
     */
    private static function leadingOptionSection(array $alt): ?string
    {
        if (($alt[0] ?? null) !== '\\') { return null; }
        $end = -1;
        for ($i = 1; $i < count($alt); $i++) {
            if ($alt[$i] === '\\') { $end = $i; break; }
        }
        if ($end <= 0) { return null; }
        $section = array_slice($alt, 1, $end - 1);
        if (count($section) === 0) { return null; }
        foreach ($section as $c) {
            if (!preg_match('/^[A-Za-z0-9-]$/', $c)) { return null; }
        }
        return implode('', $section);
    }

    /**
     * Whether any run of unescaped | is three or more long. This one rule is what makes || decidable,
     * and it is also what makes an empty group and an empty branch unwritable.
     * @param string[] $s
     */
    private static function hasBarRun(array $s): bool
    {
        $run = 0;
        for ($i = 0; $i < count($s); ) {
            if ($s[$i] === '\\') { $i += 2; $run = 0; continue; }
            if ($s[$i] === '|') {
                $run++;
                if ($run > 2) { return true; }
            } else {
                $run = 0;
            }
            $i++;
        }
        return false;
    }

    /** @param string[] $s @return array{0: array<int, string[]>, 1: bool} */
    private static function splitAlternatives(array $s): array
    {
        $alts = [];
        $cur = [];
        $inGroup = false;
        for ($i = 0; $i < count($s); ) {
            $ch = $s[$i];
            if ($ch === '\\' && $i + 1 < count($s)) {
                $cur[] = $ch; $cur[] = $s[$i + 1]; $i += 2; continue;
            }
            if ($ch === '|' && ($s[$i + 1] ?? null) === '|') {
                $inGroup = !$inGroup; $cur[] = '|'; $cur[] = '|'; $i += 2; continue;
            }
            if ($ch === '|' && !$inGroup) {
                $alts[] = $cur; $cur = []; $i++; continue;
            }
            $cur[] = $ch;
            $i++;
        }
        $alts[] = $cur;
        return [$alts, $inGroup];
    }

    /** @param string[] $s */
    private static function endsWithAnchor(array $s): bool
    {
        for ($i = 0; $i < count($s); ) {
            if ($s[$i] === '\\') { $i += 2; continue; }
            if ($s[$i] === '`' && $i === count($s) - 1) { return true; }
            $i++;
        }
        return false;
    }

    /**
     * One alternative: optional start anchor, tokens, optional end anchor. Both anchors are stripped
     * here, and a backtick anywhere else is an error — since sets moved to […] there is nothing else
     * a backtick can be.
     * @param string[] $src
     */
    private static function parseAlternative(array $src): array
    {
        $s = $src;
        $start = false;
        $end = false;
        if (($s[0] ?? null) === '`') { $start = true; $s = array_slice($s, 1); }
        if (self::endsWithAnchor($s)) { $end = true; $s = array_slice($s, 0, count($s) - 1); }
        [$tokens, $err] = self::tokenise($s);
        if ($err !== null) {
            return ['start' => $start, 'end' => $end, 'seqs' => [[]], 'error' => $err];
        }
        [$seqs, $err] = self::expand($tokens);
        if ($err !== null) {
            return ['start' => $start, 'end' => $end, 'seqs' => [[]], 'error' => $err];
        }
        return ['start' => $start, 'end' => $end, 'seqs' => $seqs, 'error' => null];
    }

    /** @param string[] $s */
    private static function findUnescaped(array $s, int $from, string $ch): int
    {
        for ($i = $from; $i < count($s); ) {
            if ($s[$i] === '\\') { $i += 2; continue; }
            if ($s[$i] === $ch) { return $i; }
            $i++;
        }
        return -1;
    }

    /** @param string[] $s */
    private static function findGroupClose(array $s, int $from): int
    {
        for ($i = $from; $i < count($s); ) {
            if ($s[$i] === '\\') { $i += 2; continue; }
            if ($s[$i] === '|' && ($s[$i + 1] ?? null) === '|') { return $i; }
            $i++;
        }
        return -1;
    }

    /** Split a group body on its single | — it can hold no ||, since the first one closed it.
     * @param string[] $s @return array<int, string[]> */
    private static function splitBranches(array $s): array
    {
        $out = [];
        $cur = [];
        for ($i = 0; $i < count($s); ) {
            if ($s[$i] === '\\' && $i + 1 < count($s)) {
                $cur[] = $s[$i]; $cur[] = $s[$i + 1]; $i += 2; continue;
            }
            if ($s[$i] === '|') { $out[] = $cur; $cur = []; $i++; continue; }
            $cur[] = $s[$i];
            $i++;
        }
        $out[] = $cur;
        return $out;
    }

    /** @param string[] $s @return array{0: array, 1: string|null} */
    private static function tokenise(array $s): array
    {
        $out = [];
        $lit = [];
        $flush = function () use (&$out, &$lit) {
            if (count($lit) > 0) { $out[] = [self::LIT, $lit]; $lit = []; }
        };
        for ($i = 0; $i < count($s); ) {
            $ch = $s[$i];
            if ($ch === '\\' && $i + 1 < count($s)) {
                if (!self::escapable($s[$i + 1])) { return [$out, self::ESCAPE_ERROR]; }
                $lit[] = $s[$i + 1];
                $i += 2;
                continue;
            }
            if ($ch === '*') { $flush(); $out[] = [self::ANY, null]; $i++; continue; }
            if ($ch === '|' && ($s[$i + 1] ?? null) === '|') {
                $close = self::findGroupClose($s, $i + 2);
                if ($close === -1) {
                    return [$out, 'unclosed || group — a group is ||…||, and a literal bar is \\|'];
                }
                $branches = [];
                foreach (self::splitBranches(array_slice($s, $i + 2, $close - $i - 2)) as $branch) {
                    if (count($branch) === 0) {
                        return [$out, 'empty alternative inside a || group'];
                    }
                    [$sub, $err] = self::tokenise($branch);
                    if ($err !== null) { return [$out, $err]; }
                    // A branch cannot hold a group: the first unescaped || after the opener closes
                    // this one, so the body was bounded before any nested opener could be read.
                    $branches[] = $sub;
                }
                $flush();
                $out[] = [self::GROUP, $branches];
                $i = $close + 2;
                continue;
            }
            if ($ch === '[') {
                $close = self::findUnescaped($s, $i + 1, ']');
                if ($close === -1) {
                    return [$out, 'unclosed [ — a set is […], and a literal bracket is \\['];
                }
                $body = array_slice($s, $i + 1, $close - $i - 1);
                // An empty set can never match, so it is refused rather than served.
                if (count($body) === 0) {
                    return [$out, 'empty set [] — a set needs characters, and a literal bracket is \\['];
                }
                $bad = self::setEscapeError($body);
                if ($bad !== null) { return [$out, $bad]; }
                $flush();
                $out[] = [self::SET, self::parseCharSet($body)];
                $i = $close + 1;
                continue;
            }
            if ($ch === ']') {
                return [$out, 'unmatched ] — a set is […], and a literal bracket is \\]'];
            }
            // Anchors were taken off both ends already, so anything left is in the middle.
            if ($ch === '`') {
                return [$out, 'a backtick is an anchor and belongs at the very start or very end — a literal backtick is \\`'];
            }
            $lit[] = $ch;
            $i++;
        }
        $flush();
        return [$out, null];
    }

    /** Desugar groups: one token list in, one list per combination out. */
    private static function expand(array $tokens): array
    {
        $seqs = [[]];
        foreach ($tokens as $t) {
            if ($t[0] !== self::GROUP) {
                foreach ($seqs as $i => $seq) { $seqs[$i][] = $t; }
                continue;
            }
            $next = [];
            foreach ($seqs as $seq) {
                foreach ($t[1] as $branch) { $next[] = array_merge($seq, $branch); }
            }
            if (count($next) > self::MAX_SEQUENCES) {
                return [null, 'too many combinations — || groups multiply, and this is over ' . self::MAX_SEQUENCES . '; use separate filters'];
            }
            $seqs = $next;
        }
        return [$seqs, null];
    }

    /**
     * The failed table is not an optimisation, it is what keeps this from hanging the UI:
     * backtracking over * is exponential without it.
     * @param string[] $raw @param string[] $text
     */
    private function matchAt(array $tokens, int $ti, array $raw, array $text, int $at, bool $mustEnd, array &$failed, int $width): bool
    {
        if ($ti === count($tokens)) {
            if ($mustEnd) { return $at === count($text); }
            return !$this->boundary || $at === count($raw) || !self::isAlnum($raw[$at]);
        }
        $key = $ti * $width + $at;
        if ($failed[$key]) { return false; }
        [$kind, $payload] = $tokens[$ti];
        $ok = false;
        if ($kind === self::LIT) {
            $n = count($payload);
            if ($at + $n <= count($text) && array_slice($text, $at, $n) === $payload) {
                $ok = $this->matchAt($tokens, $ti + 1, $raw, $text, $at + $n, $mustEnd, $failed, $width);
            }
        } elseif ($kind === self::SET) {
            // A set is always case-sensitive, so it reads the raw label.
            if ($at < count($raw) && self::setTest($payload, $raw[$at])) {
                $ok = $this->matchAt($tokens, $ti + 1, $raw, $text, $at + 1, $mustEnd, $failed, $width);
            }
        } else {
            // ANY — zero or more, shortest first.
            for ($j = $at; $j <= count($text); $j++) {
                if ($this->matchAt($tokens, $ti + 1, $raw, $text, $j, $mustEnd, $failed, $width)) {
                    $ok = true;
                    break;
                }
            }
        }
        if (!$ok) { $failed[$key] = true; }
        return $ok;
    }

    private function matchAlternative(array $alt, array $raw, array $text): bool
    {
        $width = count($text) + 1;
        $failed = array_fill(0, max(1, count($alt['tokens']) * $width), false);
        if ($alt['start']) {
            return $this->matchAt($alt['tokens'], 0, $raw, $text, 0, $alt['end'], $failed, $width);
        }
        // Unanchored: foo is conceptually *foo*.
        for ($i = 0; $i <= count($text); $i++) {
            if ($this->boundary && !($i === 0 || !self::isAlnum($raw[$i - 1]))) { continue; }
            if ($this->matchAt($alt['tokens'], 0, $raw, $text, $i, $alt['end'], $failed, $width)) {
                return true;
            }
        }
        return false;
    }
}
