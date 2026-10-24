---
major: 2
number: 22
title: Methods on number literals
description: Keep `1.twice()` working and document it; in 3.0, a decimal literal must be parenthesized before a method call, `(1.5).floor()`.
status: accepted
date: 2026-10-25
authors:
  - Turf Team
---

## Summary

A UFCS or method call on an integer literal, `1.twice()`, already compiles in 2.x, and so does one on a decimal literal, `1.5.floor()`. This proposal keeps and documents the first, and retires the second: from 3.0 a decimal literal written as a receiver needs parentheses, `(1.5).floor()`. In 2.x the unparenthesized form gets a warning with a `Fix:` that adds them.

## Motivation

`1.twice()` reads as what it is: the number one, then a call. `1.5.floor()` does not. The eye has to decide which dot ends the number and which starts the call, and the answer depends on a lexer rule the reader has never seen. Section 4.1 of the roadmap rules out a spelling "whose grouping is undecidable by eye". With parentheses, `(1.5).floor()`, there is nothing to decide.

The integer form is unambiguous because an integer literal has no dot of its own: `1.` followed by a name can only be a call.

## Design

- **Integer literal receivers stay.** `1.twice()`, `42.to_string()` and a call on any integer literal resolve like a call on an `int` variable, by the existing UFCS rules. The reference documents it.
- **Unary minus is not part of the literal.** `-1.abs()` is `-(1.abs())`, which is `-1`, as in Rust; write `(-1).abs()` for the absolute value of minus one. The reference says so beside the integer form.
- **Decimal literal receivers need parentheses in 3.0.** A literal with a fractional part or an exponent (`1.5`, `2.0`, `1e3`) directly followed by `.name` is an error in 3.0 (breaking-change entry B-18). `(1.5).floor()` and a call on a `double` variable are unaffected.
- **2.x: a warning first.** From 2.3 a decimal literal receiver without parentheses is a warning (allow-by-default when it lands, then warn, per the warn → deny ladder), with a `Fix:` that writes the parentheses. `lint-set = "3.0"` reports it as an error, and `turf migrate 3.0` applies the fix everywhere.

## Constitution check

- **I. Safe by default, unsafe by declaration.** Not affected.
- **II. Native performance, with costs you can read.** Not affected: the call compiles the same with or without parentheses.
- **III. The compiler is the authority.** The warning and the error come from the parser, with a stable code and a `Fix:`.
- **IV. Nothing crosses a boundary implicitly.** Not affected.
- **V. A few general mechanisms, not many special cases.** Not affected: the receiver rule is UFCS's, unchanged. The decimal rule is a spelling rule, not a semantic exception.
- **VI. It works when you install it.** Not affected.
- **VII. Stability is a promise.** The integer form is a promise made explicit. The decimal form breaks only in 3.0, after warning for at least two minors, with a mechanical migration.
- **VIII. A claim is not true until it is demonstrated.** See Verification.

The Non-Goals hold: no borrow checker, no no-runtime targets, no AI in the compilation path.

## Migration

`1.5.floor()` becomes `(1.5).floor()`. The 2.3 warning names every site and its `Fix:` writes the parentheses; `turf migrate 3.0` applies them all.

## Verification

- 2.2: tests for integer literal receivers (a UFCS function, a generic function, a prelude method), and for `-1.abs()` against `(-1).abs()`.
- 2.3: the warning fires on `1.5.f()`, `2.0.f()` and `1e3.f()`, not on `(1.5).f()` or `x.f()`, and its `Fix:` compiles to the same program.
- 3.0: the same programs are errors, and the compatibility corpus's uses are migrated by `turf migrate 3.0`.

## Drawbacks

- One more breaking entry in 3.0, for a spelling that is probably rare.

## Alternatives

- **Keep both forms.** Rejected: the decimal form fails 4.1's readability rule.
- **Reject integer literal receivers too.** Rejected: `1.twice()` is unambiguous and already in use.

## Unresolved questions

None.
