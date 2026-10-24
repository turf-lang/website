---
major: 2
number: 28
title: Diagnostics that explain
description: "Every diagnostic points at the code that is wrong, labels where an expectation came from, guesses common intents, reports every independent error in one run, and follows one written wording guide, checked by snapshot tests."
status: draft
date: 2026-10-25
authors:
  - Turf Team
---

## Summary

Turf's diagnostics already have a code, a category, a hint, the source line, a checked `Fix:` and `turf --explain`. This proposal brings the rest of what makes Elm's and Rust's errors teach the language: labelled spans that show *why* a type was expected, notes that show the related code, messages that recognize what the programmer meant, every independent error in one run, one wording guide for every message, and a snapshot test of every diagnostic's rendered text. Diagnostic text is outside the compatibility promise (D-6), so nothing here is breaking. It ships in 2.3 and 2.4.

## Motivation

Principle III says diagnostics are designed, not incidental, and the Constitution's closing promise is "diagnostics clear enough to teach the language as you use it". Four outputs of `turfc` on 2026-10-25 fall short of that.

**The caret points at the declaration, not at the mistake, and says nothing about either side.**

```text
── error at line 4, col 5 [E066 · type mismatch]

  Type mismatch!
  Cannot initialise 'string' variable 's' with value of type 'int'.

  4 │     mut s: string = p.x;
    │     ^~~ Here!
```

**A forgotten `mut` is reported as a missing `;`.**

```text
── error at line 3, col 6 [E102 · syntax error]

  Expected ';' after statement.

  3 │     p: P = P { x: 1, y: 2 };
    │      ^ Here!
```

**A missing field is categorized as an undeclared variable**, because the heading prints the `--smart` category (`UNDECLARED_VAR`) and not the code's own name ("Unknown struct field"), and the hint reads as a fragment:

```text
── error at line 4, col 14 [E068 · undeclared variable]

  Struct 'P' has no field named 'z'.

  Hint: It may be from the current file: 'x'
```

**One run reports one error.** A file with three independent type errors in three functions prints `(1 error)`; fixing it reveals the next, one compile at a time.

## Design

Six items. Each one is a change to how the compiler reports, never to what it accepts.

### DX-9 — The wording guide (2.3)

`docs/development/DIAGNOSTICS_STYLE.md` is the guide every message follows, and every existing message is rewritten to it:

1. **First person**, as Elm writes: "I was expecting…", "I cannot find…". The compiler is the one reading the code, so it says what it saw.
2. **One idea per sentence.**
3. **Name the types; never say "value".** "I cannot store an `int` in `s`", not "value of type 'int'".
4. **No exclamation marks.** "Type mismatch!" and "Here!" go.
5. **Every hint is something the reader can do**: an action with an example, not a restatement of the error.

Mechanics that serve the five rules: code in backticks; a span's label is a lowercase fragment ("this is an `int`"); the heading's category is the code's registered name from V-5, never the `--smart` category. The audit fixes every heading whose label does not match its code (E068 becomes "unknown struct field").

### DX-5 — Labelled spans (2.3)

The primary span underlines the code that is wrong and carries a label. Secondary spans underline where an expectation came from, each with its own label:

```text
── error at line 4, col 21 [E066 · type mismatch]

  I cannot store an `int` in `s`.

  4 │     mut s: string = p.x;
    │            ──────   ^^^ this is an `int`
    │            │
    │            `s` is a `string` because of this

  Hint: Convert it where you store it: `p.x to string`.
```

The first codes to get labels are the ones where the reader's question is "why did it expect that": type mismatches in initializers, assignments, arguments, returns and conditions, and duplicate declarations. Every code gets a primary label. The JSON form (DX-2) already has `related` spans with messages; diagnostics schema 1.1 adds `label` for the primary span.

### DX-6 — Notes that show the related code (2.4)

A related location elsewhere in the file, or in another file, is printed with its own source line, not as "(line X, col Y)" inside the message:

```text
── error at line 4, col 14 [E068 · unknown struct field]

  I cannot find a field named `z` in `P`.

  4 │     return p.z;
    │              ^ not a field of `P`

  Note: `P` is declared here.

  1 │ struct P { x: int }

  Hint: Did you mean `x`?

  Fix: replace 'z' with 'x'
  4 │     return p.x;
    │              ~
```

The notes that exist today as text ("Note: first declared here (line X, col Y)") move to this form.

### DX-7 — Messages that recognize the intent (2.4)

The parser recognizes the commonest mistakes before falling back to "Expected ';'":

```text
── error at line 3, col 5 [E1xx · missing declaration keyword]

  I think this declares a variable, but it does not start with `mut` or `immut`.

  3 │     p: P = P { x: 1, y: 2 };
    │     ^ a declaration starts here

  Hint: Write `mut p: P = ...` if `p` changes later, or `immut p: P = ...` if it does not.
```

The first set is chosen by measurement, from the SL-3 corpus and `turf-fuzz`'s mutation kinds, not by guess. It is expected to include: a declaration without `mut`/`immut`; a declaration keyword from another language (`let`, `var`, `const`, `func`, `def`, `fun`); `=` where a condition needs `==`; a missing `)` or `}` reported at the line that opened it; a type before its name (`int x`). Each pattern gets its own code from the V-5 registry, and a `Fix:` when exactly one edit is right (DX-1's rule). Where the intent has two readings, as with `mut` and `immut` above, the hint names both and no fix is printed.

### DX-8 — Every independent error in one run (2.4)

Resolution and type checking continue after an error. An expression whose type could not be decided gets an error type, which matches every other type and produces no further diagnostic, so a mistake is reported once and its consequences are not. The parser resynchronizes at the next statement and at the next top-level declaration (as `SkipToNextTopLevelBoundary()` already does for declarations). Diagnostics stay sorted by file, line and column. `--error-limit <n>` (default 20; 0 for no limit) bounds the output, and a run that reaches it says how many it did not print. The exit status is unchanged (F-CLI-1). This item builds on F-S2 (no global symbol table) and F-S3 (`SemanticModel`), which give each phase a defined state after an error.

### DX-10 — A snapshot of every diagnostic (2.3)

Every code in the V-5 registry has at least one test whose expected output is the full rendered diagnostic, colour stripped, and its JSON line. The registry check fails for a code without one. A message change is a snapshot change, reviewed as such. The tests are what make the guide hold: a message that drifts from it changes a snapshot in review.

## Constitution check

- **I. Safe by default, unsafe by declaration.** Not affected.
- **II. Native performance, with costs you can read.** Not affected at run time. Continuing after an error costs compile time only on a failing compile.
- **III. The compiler is the authority.** The principle asks for this: designed diagnostics, precise locations, and tests that check they fire for the right reason. Every message, label and note is deterministic and produced by the compiler. No model writes any of them.
- **IV. Nothing crosses a boundary implicitly.** Not affected.
- **V. A few general mechanisms, not many special cases.** One renderer for spans, labels and notes, used by every code; intent messages are parser rules with registered codes, not text matching.
- **VI. It works when you install it.** Every build prints these diagnostics, with no flag, no model and no network, including `--no-smart` builds.
- **VII. Stability is a promise.** Codes, exit statuses and the JSON schema's existing fields are unchanged; the text was never in the promise (D-6). The schema moves to 1.1 by adding a field.
- **VIII. A claim is not true until it is demonstrated.** DX-10's snapshots, and DX-7's set is chosen from measured mistakes.

The Non-Goals hold: no borrow checker, no no-runtime targets, no AI in the compilation path.

## Migration

Nothing breaks for programs. Tools that match diagnostic text break when the text changes, which D-6 has always allowed; they read `--diagnostics=json` instead. In the Turf repositories: the compiler's `EXPECT-DIAG` lines that quote text move with each rewrite, and `turf-lsp`, `turf-fuzz`, `turf-skills` and the `--smart` prompt documents are checked for text they quote.

## Verification

- DX-10's snapshots for every code, in text and JSON.
- DX-5: each labelled code has a test with the primary and secondary spans' positions and labels, in both forms.
- DX-7: each pattern fires on its mistake and does not fire on the nearest correct program; each `Fix:` is checked like every DX-1 fix; the SL-3 corpus is rerun to show the share of parse errors that get an intent message.
- DX-8: a corpus of files with several independent errors reports each once; a file with one error reports exactly what it reports today (no cascades); `--error-limit` stops where it says.

## Drawbacks

- **Every message changes.** It is a one-time churn across tests, documentation that quotes errors, and tools that read text.
- **More output.** Labels and notes make a diagnostic taller. The guide keeps each line short, and `--error-limit` bounds a run.
- **Error recovery is hard to get right.** A wrong recovery reports a phantom error, which is worse than reporting nothing. DX-8's corpus tests are the guard, and an error-type expression never produces a diagnostic of its own.

## Alternatives

- **Rust's impersonal voice** ("expected `String`, found `i64`"). Considered; the first person reads as the compiler explaining what it saw, which is the teaching tone the Constitution asks for.
- **Leave intent detection to `--smart`.** Rejected: a model can explain a mistake, but recognizing the common ones is a rule the compiler can apply in every build, and Principle III puts it there.
- **Keep one error per run.** Rejected: it turns a five-error file into five compiles.
- **Do nothing.** The four outputs in Motivation stay as they are.

## Unresolved questions

- The default for `--error-limit` (20 is proposed).
- Whether the heading moves the file location to the end of the rule line, Elm-style (`── E066 · type mismatch ──── e.tr:4:21`), or keeps `at line 4, col 21`.
