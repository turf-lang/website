---
major: 2
number: 24
title: "`static` before `fn`"
description: "Write a static method as `pub static fn T.m(...): R`, with `static` in front like its visibility; the old place after the parameter list warns in 2.3 and is removed in 3.0."
status: accepted
date: 2026-10-25
authors:
  - Turf Team
---

## Summary

A static method is written today with `static` between the parameter list and the return type: `fn Temperature.to_fahrenheit(c: double) static: double`. This proposal moves it to the front, with the declaration's other modifiers: `static fn Temperature.to_fahrenheit(c: double): double`, or `pub static fn ...` / `public static fn ...`. 2.3 accepts both and warns on the old place; 3.0 removes it (breaking-change entry B-20).

## Motivation

Whether a method takes `self` is the first thing a reader needs to know about it, and the parser needs it too. Today both find out only after reading the whole parameter list, from a word wedged between `)` and `:` where nothing else goes. In front, `static` reads like `pub` does: a property of the declaration, stated before the declaration. Java, C#, C++ and Swift's `static func` all put it there.

## Design

```turf
struct Temperature {}

static fn Temperature.to_fahrenheit(c: double): double {
    return c * 9.0 / 5.0 + 32.0;
}

pub static fn Temperature.freezing(): double { return 0.0; }

static fn<T> Box.of(v: T): Box<T> { return Box<T> { v: v }; }
```

- The modifiers come in this order: visibility (`pub` or `public`), then `static`, then `fn`. `static pub fn` is a syntax error with a `Fix:` that reorders them.
- A generic static method writes its type parameters on `fn`, as today: `static fn<T> Box.of(...)`.
- Every rule about static methods is unchanged: no `self`, called as `T::m(...)` and never through an instance, `new` cannot be static (E046), `static` on a function that is not a method is E053.
- **2.3:** the old place keeps compiling and gets a warning (allow-by-default when it lands, then warn) with a `Fix:` that moves the word. Writing `static` in both places is an error.
- **3.0:** `static` after the parameter list is an error with the same `Fix:`. `turf migrate 3.0` moves every one.

## Constitution check

- **I. Safe by default, unsafe by declaration.** Not affected.
- **II. Native performance, with costs you can read.** Not affected.
- **III. The compiler is the authority.** The warning, the error and the fix are the parser's, with stable codes.
- **IV. Nothing crosses a boundary implicitly.** Not affected. The visibility word stays first, where a reader looks for it.
- **V. A few general mechanisms, not many special cases.** Modifiers of a declaration go in one place, in front of it, instead of one of them living after the parameters.
- **VI. It works when you install it.** Not affected.
- **VII. Stability is a promise.** The new spelling is additive in 2.3 (`static` at the start of a declaration is E103 today); the old one is removed only in 3.0, after warning, with a mechanical migration.
- **VIII. A claim is not true until it is demonstrated.** See Verification.

The Non-Goals hold: no borrow checker, no no-runtime targets, no AI in the compilation path.

## Migration

`fn T.m(args) static: R` becomes `static fn T.m(args): R`, keeping any `pub`/`public` in front. The 2.3 warning's `Fix:` and `turf migrate 3.0` do it; the standard library and the examples move in 2.3.

## Verification

- 2.3: each form above compiles to the same program as its old spelling (identical IR); both places at once is an error; `static pub fn` is an error with the reordering fix; the warning fires on the old place only.
- 3.0: the old place is an error; the compatibility corpus is migrated by `turf migrate 3.0` and then passes.

## Drawbacks

- Every static method in existing code moves; the migration is mechanical, but it touches many lines.

## Alternatives

- **`fn static T.m()`.** Considered; rejected by the owner in favour of the Java-like order, which keeps every modifier in front of `fn`.
- **Keep the current place.** Rejected: the word is found late by both the reader and the parser.

## Unresolved questions

None.
