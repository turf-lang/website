---
major: 2
number: 25
title: "`pub immut` replaces `export immut`"
description: A module constant is declared `immut`, private unless marked `pub` or `public`, like every other declaration; `export` warns in 2.3 and is removed in 3.0.
status: accepted
date: 2026-10-25
authors:
  - Turf Team
---

## Summary

A module shares a constant with `export immut LIMIT: int = 10;`, and `export` is used for nothing else. This proposal spells it `pub immut LIMIT: int = 10;` (or `public immut`), the way every other public declaration is spelled, and adds the private form, a top-level `immut` without `pub`, which today is a syntax error. Module constants stay immutable: there is no top-level `mut`. `export immut` warns from 2.3 and is removed in 3.0 (breaking-change entry B-21).

## Motivation

Turf's visibility rule (F-VIS-1) is one word: a declaration is private unless it says `pub`. Constants are the one exception. They use their own keyword, `export`, which is always public, so a constant can never be private to its module, and `pub export` is a separate error to explain. A reader who has learned `pub` has to learn `export` for one case.

## Design

```turf
pub immut LIMIT: int = 10;        // visible to importers, as `export immut` is today
public immut RATIO: double = 0.5; // `public` is `pub`
immut SCALE: int = 4;             // private to this module
```

- A top-level `immut` declares a module constant, with the rules `export immut` has today: a type, an initializer that is a compile-time constant (a leading `-` allowed), read by importers as `m::NAME` (F-IMP-1).
- With `pub` or `public` it is visible outside the module; without, only inside it (F-VIS-1).
- A top-level `mut`, with or without `pub`, stays an error (E087); the hint says module state is not supported and suggests `immut`.
- **2.3:** `pub immut` and private `immut` are added. `export immut` keeps compiling, with a warning (allow-by-default when it lands, then warn) and a `Fix:` that writes `pub immut`.
- **3.0:** `export immut` is an error with the same `Fix:`. `export` stays a reserved word, so no program changes meaning; it only stops compiling.

## Constitution check

- **I. Safe by default, unsafe by declaration.** Not affected: constants stay immutable.
- **II. Native performance, with costs you can read.** Not affected: the same constant is emitted.
- **III. The compiler is the authority.** Not affected.
- **IV. Nothing crosses a boundary implicitly.** Strengthened: a constant crosses the module boundary only if it says `pub`, like everything else, and a module can now keep one private.
- **V. A few general mechanisms, not many special cases.** One visibility word for every declaration, instead of a keyword for constants alone.
- **VI. It works when you install it.** Not affected.
- **VII. Stability is a promise.** Additive in 2.3 (both new forms are errors today). `export` is removed only in 3.0, after warning, with a mechanical migration.
- **VIII. A claim is not true until it is demonstrated.** See Verification.

The Non-Goals hold: no borrow checker, no no-runtime targets, no AI in the compilation path.

## Migration

`export immut` becomes `pub immut`. The 2.3 warning's `Fix:` and `turf migrate 3.0` do it; the standard library moves in 2.3, and its public surface (F-API-1) is unchanged, since the same names stay public.

## Verification

- 2.3: `pub immut`, `public immut` and `export immut` give the same program and the same importer view; a private `immut` is visible in its module and E-coded outside it with the usual visibility hint; top-level `mut` stays E087; the stdlib surface lock (`tests/46_stdlib_surface/`) passes after the stdlib moves.
- 3.0: `export immut` is an error with the fix; the compatibility corpus passes after `turf migrate 3.0`.

## Drawbacks

- Every exported constant in existing code is rewritten, mechanically.

## Alternatives

- **Keep `export`.** Rejected: one keyword for one case, against one visibility rule.
- **Allow `pub mut` module state.** Out of scope; the owner keeps module variables immutable.

## Unresolved questions

None.
