/*
Copyright 2026 Steven Spungin

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/**
 * **No flicker** — the filter box policy, for a list that updates as a pattern is typed.
 *
 * Ruled 2026-09-23.
 *
 * Every pattern passes through states that cannot be read. `[0-9]` is invalid at `[`, `[0`, `[0-` and
 * `[0-9]`'s four prefixes; so is `a|`, `` ` ``, `\-\` and every half-typed group. The language answers
 * each of those with *match everything and say why*, which is the right answer for a filter — a
 * confident empty list is indistinguishable from a pattern that genuinely matched nothing — but
 * showing every row for one keystroke and then narrowing again **flickers**, and a list that flashes
 * its whole contents at the user four times while they type one set reads as a bug.
 *
 * So: keep the last matcher that could be read, and say the result is stale. Nothing is hidden, and
 * nothing jumps.
 *
 * **This is deliberately NOT part of the language**, and therefore not in the Rust, Python, Go and PHP
 * ports. `conformance/cases.json` defines what a pattern MEANS; this file decides what a text box
 * DOES between two meanings, which is host policy — the ports have no text box. It ships here because
 * this is the implementation with a UI attached, and because every host that re-derives this policy
 * gets it slightly wrong.
 */
import { compileLabelFilter, type LabelMatcher } from './index.ts';

/** What to render after one keystroke. */
export interface StickyFilterState {
  /**
   * The matcher to filter with: the newest pattern that could be read, or — until one can be —
   * a matcher that keeps every row, because an unreadable pattern hides nothing.
   */
  match: LabelMatcher;
  /** Why the pattern **as typed** cannot be read, if it cannot. Show this; do not act on `match`. */
  error: string | null;
  /**
   * `true` when `match` is older than the pattern in the box — the result on screen is the previous
   * one. A host should say so quietly (dim the count, caption the list) rather than blank it.
   */
  stale: boolean;
}

/** A matcher that keeps every row, for before the first readable pattern. */
function keepEverything(): LabelMatcher {
  // `Object.assign` rather than a cast: the callable and its `error` property are built together, so
  // the type is satisfied instead of asserted.
  return Object.assign((_label: unknown): boolean => true, { error: null });
}

/**
 * Create a filter that never flickers.
 *
 * ```ts
 * const filter = createStickyFilter()
 * input.addEventListener('input', () => {
 *   const { match, error, stale } = filter.update(input.value)
 *   if (!stale) render(rows.filter(match))   // only repaint when the answer is new
 *   showError(error)                          // always say what cannot be read
 * })
 * ```
 *
 * **Acting on rows is a different contract.** `error` means *do not act*: for anything destructive —
 * delete the matches, move the matches — a matcher carrying an error must not be used at all, and a
 * stale one must not be used either, because it answers a question the user is no longer asking.
 * `canAct` below is that check, made once rather than remembered five times.
 */
export function createStickyFilter(): {
  update(pattern: string): StickyFilterState;
  /** The last state produced, or the initial keep-everything state. */
  current(): StickyFilterState;
  /** Whether the current state is safe to act on destructively: readable, and not stale. */
  canAct(): boolean;
  /** Forget the remembered matcher — for when the list itself changes underneath the box. */
  reset(): void;
} {
  let good: LabelMatcher | null = null;
  let state: StickyFilterState = { match: keepEverything(), error: null, stale: false };

  return {
    update(pattern: string): StickyFilterState {
      const m = compileLabelFilter(pattern);
      if (!m.error) {
        good = m;
        state = { match: m, error: null, stale: false };
        return state;
      }
      // Unreadable. Hold the last answer if there is one; otherwise keep every row, which is what
      // the language does and the only honest thing to show before anything has been readable.
      state = {
        match: good ?? keepEverything(),
        error: m.error,
        stale: good !== null,
      };
      return state;
    },
    current(): StickyFilterState {
      return state;
    },
    canAct(): boolean {
      return state.error === null && !state.stale;
    },
    reset(): void {
      good = null;
      state = { match: keepEverything(), error: null, stale: false };
    },
  };
}
