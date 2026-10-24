---
major: 2
number: 21
title: Iterating over a string
description: Let `for c in s` run over the bytes of a `string`, each as a `char`, with the same check `s[i]` has.
status: accepted
date: 2026-10-25
authors:
  - Turf Team
---

## Summary

`for c in s` works over an array but not over a `string`, which is E005 ("for-each requires an array"). This proposal lets a for-each loop take a `string` and run its body once per byte, with `c` a `char`, exactly as the index loop over `s[i]` does today.

## Motivation

Walking a string byte by byte is one of the first things a program does with text: counting characters, finding a separator, checking that every character is a digit. Today it is written by hand:

```turf
for i in 0..strlen(s) {
    immut c: char = s[i];
    if c == ',' { commas++; }
}
```

The index is noise, `strlen(s)` is easy to get wrong (`strlen(s) - 1`, `<=`), and the loop reads less like what it does than the array form next to it.

## Design

```turf
for c in s {
    if c == ',' { commas++; }
}
```

- `s` is any expression of type `string`. It is evaluated once, before the first iteration, and so is its length (`strlen` at that moment).
- `c` is a `char` holding byte `i` of the string, for `i` from `0` up to but not including that length. It is immutable, like the variable of an array for-each.
- Each iteration reads the byte through the same check `s[i]` has (F-STR-1): a read outside `0 <= i < strlen(s)` panics. A loop that writes a `'\0'` into `s` partway through therefore panics at the next read past the new end, as the long-hand loop would, instead of reading past it.
- `break`, `continue` and `return` behave as in every other loop.
- Iteration is over **bytes**, the unit `s[i]` and `strlen` already use. A string holding UTF-8 text gives one `char` per byte, not per code point. A code-point view belongs with the standard library or with TDP-2-011's iteration protocol, and can be added later without changing this one.

The long-hand program it replaces, which it compiles to with the same checks:

```turf
immut __s: string = s;
immut __n: int = strlen(__s);
for __i in 0..__n {
    immut c: char = __s[__i];
    ...
}
```

When TDP-2-011's iteration protocol lands, `string` becomes one more type that implements it, with the same meaning.

## Constitution check

- **I. Safe by default, unsafe by declaration.** Every byte is read with `s[i]`'s check; the loop has no path around it.
- **II. Native performance, with costs you can read.** One `strlen` before the loop and one checked read per iteration, the same as the long-hand loop. Where the bounds are proven (INV-OPT-2) the check is elided as it is for the index loop.
- **III. The compiler is the authority.** Not affected.
- **IV. Nothing crosses a boundary implicitly.** Not affected.
- **V. A few general mechanisms, not many special cases.** The for-each loop already takes an array; a string is a sequence of `char` read with `[]`, so it takes the same loop. TDP-2-011 later makes this one instance of a general protocol.
- **VI. It works when you install it.** Not affected.
- **VII. Stability is a promise.** Additive: every program it accepts was E005 before.
- **VIII. A claim is not true until it is demonstrated.** See Verification.

The Non-Goals hold: no borrow checker, no no-runtime targets, no AI in the compilation path.

## Migration

Nothing breaks.

## Verification

- A test that `for c in s` and the long-hand loop print the same bytes for an empty string, a one-byte string, a literal, a string built at run time and a string holding UTF-8.
- A `fail_` test: a loop that writes `'\0'` into `s` partway through panics with `String index out of bounds` at the loop's line.
- `break`, `continue` and `return` inside the body, and a nested for-each over two strings.
- The emitted IR has one `strlen` call outside the loop.

## Drawbacks

- Byte iteration surprises someone who expects code points. The reference says so where it documents the loop, and `s[i]` already behaves the same way.

## Alternatives

- **Do nothing.** The index loop works. Rejected: the owner asked for it, and the cost is small.
- **Wait for TDP-2-011.** The protocol arrives in 2.5. Rejected: the meaning is the same either way, and the loop is useful now.
- **Iterate code points.** Rejected for the default: `s[i]` and `strlen` are byte-based, and a loop that disagreed with them would be the surprise.

## Unresolved questions

None.
