---
major: 2
number: 21
title: Iterating over a string
description: Let `for c in s` run over the bytes of a `string`, each as a `char`, panicking where `s[i]` would.
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
for i in 0..s.length() {
    immut c: char = s[i];
    if c == ',' { commas++; }
}
```

The index is noise, the bound is easy to get wrong (`s.length() - 1`, `<=`), and the loop reads less like what it does than the array form next to it.

## Design

```turf
for c in s {
    if c == ',' { commas++; }
}
```

- `s` is any expression of type `string`. It is evaluated once, before the first iteration, and so is its length. Reassigning the variable inside the loop does not change what the loop walks.
- `c` is a `char` holding byte `i` of the string as it is when the iteration starts, for `i` from `0` up to but not including that length. It is immutable, like the variable of an array for-each. The paired form `for (i, c) in s` gives the index too, as it does for an array.
- If the byte the loop reaches is `'\0'`, the body has made the string shorter than the loop's position, and the read panics with `String index out of bounds`, as `s[i]` would. A string's allocation never shrinks and the collector does not move it, so every byte below the starting length stays readable whatever the body does: the loop can never read outside the string's memory.
- `break`, `continue` and `return` behave as in every other loop.
- Iteration is over **bytes**, the unit `s[i]` and `s.length()` already use. A string holding UTF-8 text gives one `char` per byte, not per code point. A code-point view belongs with the standard library or with TDP-2-011's iteration protocol, and can be added later without changing this one.

The long-hand program it replaces:

```turf
immut __s: string = s;
immut __n: int = __s.length();
for __i in 0..__n {
    immut c: char = __s[__i];
    ...
}
```

`s[i]` measures the string on every read, which makes the long-hand loop quadratic whenever its body calls a function. The for-each loop measures once and checks each byte against `'\0'` instead. It panics in the same place as the long-hand loop except when the body writes a `'\0'` *behind* the loop's position: the long-hand loop panics at its next read, and the for-each loop goes on to the starting length, reading bytes that are still the string's own memory.

When TDP-2-011's iteration protocol lands, `string` becomes one more type that implements it, with the same meaning.

## Constitution check

- **I. Safe by default, unsafe by declaration.** The loop reads only bytes below the length the string had when the loop started, which stay inside its allocation; a byte that has become the end panics.
- **II. Native performance, with costs you can read.** One length before the loop and one compare per byte: linear, where the long-hand loop is quadratic when its body calls a function.
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
- A `fail_` test: a loop that writes `'\0'` ahead of its position panics with `String index out of bounds`.
- `break`, `continue` and `return` inside the body, the paired form, a nested for-each over two strings, a reassignment of the variable inside the loop, and a byte changed ahead of the loop.

## Drawbacks

- Byte iteration surprises someone who expects code points. The reference says so where it documents the loop, and `s[i]` already behaves the same way.
- A `'\0'` written behind the loop's position does not stop it, where the long-hand loop would panic. Measuring the string on every byte would close that gap at the cost of a quadratic loop.

## Alternatives

- **Do nothing.** The index loop works. Rejected: the owner asked for it, and the cost is small.
- **Wait for TDP-2-011.** The protocol arrives in 2.5. Rejected: the meaning is the same either way, and the loop is useful now.
- **Iterate code points.** Rejected for the default: `s[i]` and `s.length()` are byte-based, and a loop that disagreed with them would be the surprise.

## Unresolved questions

None.
