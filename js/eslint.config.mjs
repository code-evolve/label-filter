// **The style rule, and the guard that makes applying it safe.**
//
// The house style is no trailing semicolons and single quotes. Converting to it by hand is the one
// thing forbidden, because automatic semicolon insertion does not join lines the way a reader expects:
// a line ending without a semicolon followed by one opening with `(`, `[`, a backtick, `+`, `-`, `/`
// or a regex fuses into a single expression, silently and with different behaviour.
//
// So `no-unexpected-multiline` is not optional decoration next to `semi: never`. It is the rule that
// catches exactly the fusion `semi: never` can create, and the pair is applied together or not at all.
import tseslint from 'typescript-eslint'

export default [
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.mjs'],
    rules: {
      semi: ['error', 'never'],
      'no-unexpected-multiline': 'error',
      quotes: ['error', 'single', { avoidEscape: true }],
      // The matcher is a parser: it uses control characters and non-null assertions deliberately, and
      // the property suite asserts the one cast that needs stating.
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-control-regex': 'off',
      // A leading underscore marks a parameter that exists to satisfy a signature and is deliberately
      // unread, which is the opposite of the mistake this rule looks for. Everything else still fails:
      // it found one genuinely dead binding in the property suite on its first run.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  { ignores: ['dist/**', 'node_modules/**', 'docs/**'] },
]
