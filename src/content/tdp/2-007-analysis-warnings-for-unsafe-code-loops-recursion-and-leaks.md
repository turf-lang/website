---
major: 2
number: 7
title: Analysis warnings for unsafe code, loops, recursion and leaks
description: Add a family of warnings that find mistakes in unsafe code, infinite loops, infinite recursion, manual-heap leaks, precision loss, dead code and raw-receiver calls, without rejecting any program that compiles today.
status: accepted
date: 2026-10-15
updated: 2026-10-16
authors:
  - Turf Team
---

## Summary

The compiler already finds some mistakes by analysing a function: it knows when a loop cannot end, when every path recurses, and when a pointer may be null. This proposal extends that analysis in 2.3 with new checks for `unsafe` code, loops, recursion, nullability, manual-heap leaks, `int`-to-`double` precision loss, dead code and method calls through a raw receiver. Every one lands as a **warning**. None rejects a program that compiled before. Each carries a stable code and a hint, and each has a measured false-positive record before it ships. Promotion to an error is a separate, later decision in 3.0.

## Motivation

Turf aims to be safe by default and to say so loudly when it is not. The checks that exist are good, and they leave known gaps:

- **Unsafe code gets little help.** Inside `unsafe { }` the compiler trusts the author. It does not notice a pointer that may be null, a `free` of memory that never came from `alloc`, or an `unsafe` block that holds nothing unsafe.
- **Infinite loops are found only structurally.** The compiler sees a loop with no `break` and no way out. It misses a loop whose condition variables are never written in the body.
- **Infinite recursion is a hard error, but only for the simplest case.** Self-recursion on every path is rejected. Two functions that call each other forever are not noticed.
- **Leaks on the manual heap are silent.** Memory from `mem::alloc` that is never freed is invisible.
- **A method call through a raw pointer needs no `unsafe`.** This is a known gap in the pointer rules: `a.next.get()` with `next: Node*` compiles with no mark of the danger.

More checks are valuable. But a compiler that starts rejecting programs it accepted last month breaks trust, so the rule for how checks arrive matters as much as the checks.

## Design

### The rule: warn first

Every new check follows the warn-to-deny ladder from the versioning contract:

1. **It lands as a warning in a minor.** It has a stable diagnostic code, a hint, and a recorded false-positive result over the standard library, the tests, the showcase programs and the examples. Zero untriaged hits is the bar.
2. **It can be silenced.** The lint levels in [TDP-2-003](/tdp/2-003/) (lint levels, deprecation and the compatibility contract) land first, so no one edits correct code just to quiet a new warning.
3. **It stays a warning for the rest of 2.x.** Promotion of a proven check to an error is a 3.0 decision. A heuristic check stays a warning in every version and lives in an opt-in group.

### The checks

| Check | Notes |
|---|---|
| **`unsafe` checks.** A raw-pointer dereference not provably non-null; `mem::free` of a pointer not derived from `mem::alloc` in the same function; a write through a pointer derived from an immutable array; pointer arithmetic with no bounds evidence; an integer-to-pointer cast; an `unsafe` block containing no unsafe operation; a very large `unsafe` block. | Reuses the nullability and alias analyses. |
| **Loops.** A loop whose condition variables are never written in the body; a loop whose every exit is guarded by a condition proven false; a loop whose only exit is behind a call that never returns. | Warning only, forever: termination is undecidable, so there is no promotion. |
| **Recursion.** (a) Mutual recursion where every path through a call cycle recurses. (b) A base case proven unreachable. | Both are *proven* cases and the candidates for promotion, consistent with today's self-recursion error. |
| **Nullability, in full.** Fields, arguments and returns of a narrowed nullable reference, across calls. | This *increases* what is accepted: programs that needed a local cast no longer do. |
| **Manual-heap leaks.** Memory from `mem::alloc` that is never freed, on the manual heap only. | Garbage-collected memory is not reported. |
| **Precision loss.** An opt-in warning when an `int` is converted to `double` and may lose digits. | Never an error. Off by default. |
| **Dead code.** An unused private function, an unused import, an unused `pub` item in a binary's root. | Needs the module graph. Can be allowed. |
| **Raw-receiver calls.** A method call through a raw-pointer receiver, which needs no `unsafe` today. | A warning in 2.3 and an error in 3.0. |

One more recursion check, "no argument shrinks", is a heuristic. It arrives in 2.6 inside an opt-in `pedantic` group and is never promoted.

### Output

Each warning prints like any diagnostic: a code, a location, a hint and, once [TDP-2-001](/tdp/2-001/) (fixes in diagnostics without a model) allows it, a `Fix:` when one edit is certain.

```text
── warning at line 12, col 5 [W040 · loop never changes its condition]

  The loop runs while 'running' is true, but nothing inside it changes 'running'.

  Hint: Assign to 'running' inside the loop, or use 'break' to leave it.
```

## Constitution check

- **I. Safe by default, unsafe by declaration.** This proposal strengthens it. It finds mistakes in code that is declared unsafe and in code that should have been, and it asks for no weakening of a check.
- **II. Native performance, with costs you can read.** Not affected for compiled programs. The analysis runs at compile time, and its cost is bounded by running only on function bodies.
- **III. The compiler is the authority.** Each check is a deterministic analysis in the compiler with a stable code. No tool decides what is a leak.
- **IV. Nothing crosses a boundary implicitly.** The unsafe and raw-receiver checks make a boundary visible where it was silent. The raw-receiver call is the clearest case.
- **V. A few general mechanisms, not many special cases.** All checks use the existing flow passes and the one warning mechanism. None matches a name.
- **VI. It works when you install it.** No setup is needed. A warning appears by default and can be silenced.
- **VII. Stability is a promise.** No program that compiled stops compiling. A new warning is output text and a code, and the lint-set pin protects a project that denies warnings.
- **VIII. A claim is not true until it is demonstrated.** Each check ships with a recorded false-positive result over the repository's own programs, and a test for every code.

The Non-Goals hold. This does not add a borrow checker: the checks are local analyses and warnings, not an ownership system. It asks for no no-runtime targets, and no model is involved.

## Migration

Nothing breaks. A program that compiles keeps compiling. A project that sees a new warning can allow it by code or pin the lint set. Promotion to errors, where it happens, is a 3.0 item with its own migration.

## Verification

- A failing-program and a passing-program test for every warning code.
- The recorded false-positive result over `lib/std`, `tests/`, `showcase/` and `examples/` for each check, with zero untriaged hits.
- A test that each warning can be allowed and that a `lint-set` pin hides a check added after it.
- For the loop and recursion checks, tests that known-terminating loops and bounded recursion are not reported.
- Compile-time measurements, so the analysis does not slow a normal build beyond the noise.

## Drawbacks

- A warning that is wrong is noise, and the more checks there are, the more chances for noise. The false-positive bar and the ability to allow a code are the defence.
- Heuristic checks can never be promoted, so some real bugs stay warnings.
- More analysis means a longer compile. It is measured and bounded.

## Alternatives

- **Make them errors from the start.** Rejected: it breaks programs that compile today, against the 2.x promise.
- **Do nothing.** The known gaps stay open.
- **A separate lint tool.** Rejected: the analyses are already in the compiler, and a second tool would duplicate them.

## Unresolved questions

- The exact diagnostic codes and group names, which come from the diagnostic-code registry described in [TDP-2-003](/tdp/2-003/) (lint levels, deprecation and the compatibility contract).
- Whether the mutual-recursion check needs its own small call graph now, or waits for the intermediate representation.
- The threshold for a "very large" `unsafe` block.
- Whether dead-code warnings should be on by default or opt-in.
