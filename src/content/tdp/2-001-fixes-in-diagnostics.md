---
major: 2
number: 1
title: Fixes in diagnostics without --smart
description: Let the compiler print a concrete, validated fix with an error whenever it is sure of one, in every build and without a model.
status: accepted
date: 2026-10-15
authors:
  - Turf Team
discussion: https://github.com/turf-lang/turf-lang/issues/270
---

## Summary

When the compiler can name the exact edit that removes an error, it should print that edit with the error, in every build, with no model and no flag. Today a diagnostic usually says what to do (a `Hint:` sentence), and the corrected code only appears with `--smart`, which needs the larger `-smart` build and a language model on disk. This proposal adds a `Fix:` to a diagnostic when, and only when, the compiler has computed a single edit and confirmed by re-checking that the edit removes the error and adds no new one. `--smart` stays, for the errors that have no rule-based fix.

## Motivation

A diagnostic helps most when the reader can act on it at once. Turf's diagnostics have stable codes, precise locations and a `Hint:`. The gap is between a hint and a fix. Compare the two for a misspelled name:

```text
  I can't find anything named 'nmae'.

  Hint: It may be from the current file: 'name'
```

The reader still has to find the line, work out which part to change, and retype it. The compiler already knows all three.

How much of the work is already done? Running `turf check` over the 771 `fail_*.tr` files in the compiler's own test suite and counting what each error code prints gives the table below. The suite exercises 136 of the 149 codes.

| What the diagnostic prints | Codes |
|---|---|
| A hint that names something concrete (a quoted name, a keyword, a snippet) | 111 |
| A hint with only general advice (E001, E004, E010, E044, E104, and 15 more) | 20 |
| No hint at all (E105, E106, E115, E116, E118) | 5 |

So most codes already carry a concrete suggestion, written as a sentence. Turning the concrete ones into an actual edit is a small step. Today the only route to corrected code is `--smart`. Part of that mechanism already exists and needs no model: `--smart` first tries a rule-based fix for 11 error classes (renames only), validates it in a sandbox re-check, and shows it in about 0.03 s without calling the model. But it still sits behind the flag, it covers only renames, and it labels its result as an AI suggestion although no model ran. For everything else, `--smart` needs:

- the `-smart` archive, or a source build without `--no-smart`;
- a model file the user chooses and downloads (the one Turf is developed with is about 1 GB on disk and 1.5 GB of RAM while it runs);
- time for the model to run on every error.

This proposal therefore moves the rule engine out of the model's pipeline, shows its result by default, and widens the classes it covers. That is the wrong place for fixes that need no judgement. A misspelled variable with one near neighbour, a missing `;`, an `immut` that is assigned to: these have a single right answer, and a rule can produce it instantly and the same way every time. Principle III says the compiler is the authority and that diagnostics are designed, not incidental; a fix is part of that design.

## Design

### A diagnostic can carry a fix

A diagnostic gains an optional fix: a description and one or more edits, each a source span and its replacement text. It prints after the hint, as the corrected line with the changed part marked:

```text
── error at line 3, col 27 [E040 · undeclared variable]

  I can't find anything named 'nmae'.

  Hint: It may be from the current file: 'name'

  3 │     printline("Hello, " + nmae + "!");
    │                           ^~~~ Here!

  Fix: replace 'nmae' with 'name'
  3 │     printline("Hello, " + name + "!");
    │                           ~~~~

  Run `turf --explain E040` for more details.
```

The `Hint:` is kept. It explains; the `Fix:` shows. A diagnostic with no fix prints exactly what it prints today.

### When a fix is offered

A fix is offered only when all three hold:

1. **The compiler produced exactly one candidate edit.** One near-miss name, one missing token, one declaration to change. If there are several plausible edits, none is chosen for the reader: the diagnostic keeps its hint and may list the candidates in the hint, as it does now.
2. **The edit is checked.** The compiler applies the edit to an in-memory copy of the program and re-checks it. The fix is shown only if the original diagnostic is gone and no new error appears. This is the test `--smart` already applies to a model's suggestion before showing it, run on the compiler's own edit. It happens only on the error path, so a clean compile costs nothing.
3. **The error class declares the fix.** Each error class that can produce one says how, next to where it already builds its hint. The compiler never matches on an error's name or text to decide a fix (Principle V).

### The first set

The first set is the errors whose hint already names the edit and where the answer is unique. For example:

| Code | Fix |
|---|---|
| E040, an undeclared name with one close match | replace the name |
| E060, assigning to an `immut` variable | change `immut` to `mut` at the declaration |
| E102, a missing `;` | insert the `;` at the end of the previous statement |

The full list is part of the work, found by walking the 111 codes that already have a concrete hint.

### Tests

A fix is a promise, so it is tested like one. A test file may say which fix it expects, next to the `// EXPECT-DIAG:` marker the suite already uses:

```text
// EXPECT-DIAG: E040
// EXPECT-FIX: replace 'nmae' with 'name'
```

The runner compares the printed fix, and also applies it and confirms the program then compiles. A code that declares a fix and has no test with `EXPECT-FIX` fails a repository check, in the way the existing checks already tie error codes to their pages.

### What does not change

`--smart` works as it does now. The order becomes: the compiler's own fix first, the model only when the compiler has none. `turf --explain` pages do not change. (The command is spelled `turf explain` once [TDP-2-019](/tdp/2-019/) (a pure compiler) moves it out of `turfc`.)

## Constitution check

- **I. Safe by default, unsafe by declaration.** Not affected. A fix is text shown to the reader. Nothing is applied to the source, and a fix is never a way around a safety check: the edit must make the program pass the same checks.
- **II. Native performance, with costs you can read.** Not affected for compiled programs. The work happens only when an error is reported, and the cost is one re-check per fix, which the proposal bounds (see Unresolved questions).
- **III. The compiler is the authority.** This proposal exists to serve it. A fix comes from rules inside the compiler, is deterministic, uses no network and no model, and gives the same output for the same source every time.
- **IV. Nothing crosses a boundary implicitly.** The fix is shown, never applied. The reader chooses to make the edit. A fix that would add an `import` says so in its text.
- **V. A few general mechanisms, not many special cases.** One mechanism: an error class declares its fix. No fix is chosen by matching an error's name or message. Library-specific errors use the same mechanism as the rest.
- **VI. It works when you install it.** This is the main gain. Fixes work in the plain build with nothing else to download.
- **VII. Stability is a promise.** Programs are unaffected. Tools that read the text of diagnostics will see new `Fix:` lines. Error codes and their meaning do not change.
- **VIII. A claim is not true until it is demonstrated.** A fix is shown only after it has been applied and re-checked, and each declared fix has a test that does the same.

The Non-Goals hold. This asks for no borrow checker and no change to the runtime. And it puts no AI in the compilation path: the fixes are rules, and the model stays an optional, on-request helper behind `--smart`.

## Migration

Nothing breaks. Source code is unaffected. A tool that matches the exact text of a diagnostic may need to allow for the new `Fix:` lines. The documentation pages that quote diagnostic output (the language reference and the Learn guides) are regenerated from real compiler output and pick the change up.

## Verification

- The `EXPECT-FIX` marker in the regression suite, with the apply-and-recompile check described above, for every code that declares a fix.
- A repository check that fails when an error class declares a fix and no test covers it.
- The baseline table in the Motivation, re-run after the change, to show how many of the 136 exercised codes now print a fix. The script is a loop over the `fail_*.tr` files; it should be checked in so the number can be reproduced.
- A test that a clean compile does not enter the fix path.

## Drawbacks

- Every error class that offers a fix is more code to keep correct when the language changes. The apply-and-recheck test is what keeps a stale fix from surviving.
- A fix that passes the re-check can still be the wrong one: renaming to a different variable that exists but was not meant. Limiting fixes to a single candidate reduces this and does not remove it.
- Diagnostics get longer. The fix repeats a line the reader has just seen.

## Alternatives

- **Do nothing.** Readers who want corrected code install the smart build and a model. Rejected: most fixes need no judgement, and this puts a 1 GB download between the reader and a missing semicolon.
- **Make the model run by default.** Rejected: it breaks Principle VI and Principle III's "no model" rule for validity, and costs seconds per error.
- **Offer fixes only through the language server.** Useful, and wanted as well (see below), but the command line is where a new reader meets their first error.
- **Apply fixes automatically with a `--fix` flag.** Left for a later proposal. Showing is safe by default; applying changes the reader's files.

## Unresolved questions

- Should the same fixes be offered as quick fixes by `turf-lsp`? Probably yes, from the same declarations, as a follow-up.
- The machine-readable form and the apply command are now [TDP-2-004](/tdp/2-004/) (machine-readable diagnostics and applying fixes). It lands first, so tools never need to read the `Fix:` text.
- Does the rule fix work in a `--no-smart` build? The sandbox and rule layer are compiled in every build, but this has not been tested and must be verified before relying on it.
- Does a missing `;` print with a code at all? E102 exists, but the benchmark's semicolon case showed no code in its output, so confirm before listing E102 in the first set.
- The 136-of-149 count uses a different method from a count of distinct `EXPECT-DIAG` codes (140). The checked-in script settles it.
- When there are two or three candidates, do we list them all as numbered fixes, or only name them in the hint?
- A bound on the work: at most one fix check per error, and a cap on the number of errors that get one in a single compile.
- The wording: `Fix:`, `Did you mean`, or something else. It must work for a one-character change and for a multi-line one.
- Which of the 20 codes with only general advice, and the 5 with no hint, can be given a concrete hint first, since a fix builds on one.
