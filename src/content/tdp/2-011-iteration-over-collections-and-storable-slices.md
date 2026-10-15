---
major: 2
number: 11
title: Iteration over collections and storable slices
description: Let `for x in list` work over the standard collections through a simple protocol, and let a `Slice<T>` be stored in fields, returned and kept in collections.
status: proposed
date: 2026-10-15
authors:
  - Turf Team
---

## Summary

`for x in arr` works over an array, but `for x in list` is an error (E005), so a collection has to be walked with an index. This proposal defines a small structural protocol that lets `for` walk any collection that has a length and an indexed getter, with `Map` walked through its keys, and it lowers to the same index loop a person would write. It also makes `Slice<T>`, a view into contiguous data, a value that can be stored in struct fields, returned from a function, and collected, with the compiler preventing a view from outliving its data.

## Motivation

Walking a `List` today means writing the loop by hand:

```turf
mut i = 0;
while i < items.length() {
    printline(items.get(i));
    i = i + 1;
}
```

Arrays can use `for`, collections cannot, and this is the first thing a new reader tries. Slices have a related limit: a `Slice<T>` can be passed to a function, but it cannot be kept in a struct, returned or placed in a collection, because the compiler cannot yet prove the data behind it stays alive.

## Design

### The iteration protocol

A type may be iterated with `for` when it has two methods: `length()` returning an `int`, and `get(i)` taking an `int`. The `for` loop lowers to an index loop over them.

```turf
for item in items {
    printline(item);
}
```

is lowered to the loop above, with the same bounds check `get` already has. The protocol is structural: the compiler looks for the two methods and no declaration is needed, so no trait system is introduced. A `Map` is iterated through its `keys()`, so `for key in map.keys()` works and the order is the map's own order.

Three designs are on the table, a structural protocol, a `next(): !E` method, and an `each(f)` callback. The choice is made after closures exist, since `each(f)` depends on them. The structural protocol is the recommendation: it needs no new concept and it produces the loop people write by hand.

A collection modified during iteration is treated as it is by the hand-written loop, so a `length()` read each pass picks up a change. This is documented and not a new rule.

### Storable slices

A `Slice<T>` becomes an ordinary value that can live in a struct field, be returned, and be stored in a collection, including a view into a `List<T>` buffer.

```turf
struct Line {
    text: Slice<byte>;
}

fn first_line(buf: Slice<byte>): Slice<byte> {
    return buf[0..find_newline(buf)];
}
```

The safety rule is the one already used for references: a slice must not outlive the data it views. Where the data is garbage-collected, the collector keeps it alive through the interior pointer, which needs an efficient block lookup in the collector. Where the data is a stack array, the escape analysis rejects any use that lets the view escape the function.

## Constitution check

- **I. Safe by default, unsafe by declaration.** A stored slice cannot dangle. Either the collector keeps the data alive or escape analysis rejects the program. Iteration keeps the bounds check of `get`.
- **II. Native performance, with costs you can read.** `for` lowers to the index loop a person would write, so there is no hidden iterator object. A slice is a pointer and a length.
- **III. The compiler is the authority.** The compiler checks that the two methods exist and have the right types, and says exactly which one is missing.
- **IV. Nothing crosses a boundary implicitly.** A view over data owned elsewhere is visible in its type, `Slice<T>`.
- **V. A few general mechanisms, not many special cases.** One protocol covers every collection. The standard library's own types use it with no special case.
- **VI. It works when you install it.** No dependency.
- **VII. Stability is a promise.** Both features accept programs that are errors today. No existing loop changes meaning.
- **VIII. A claim is not true until it is demonstrated.** Tests compare the lowered loop with the hand-written one, and stress runs show stored slices keep their data alive.

The Non-Goals hold. Slice lifetime is handled by the collector and escape analysis, not a borrow checker. No no-runtime target is asked for, and no model is involved.

## Migration

Nothing breaks. Hand-written index loops keep working, and an array iterates as before.

## Verification

- A test that `for` over a `List`, `Set` and `Map.keys()` produces the same output as the index loop.
- A test that the generated code of the lowered loop matches the hand-written loop.
- Tests under `TURF_GC_STRESS` that a stored slice into a `List` buffer survives a collection, including when the list grows.
- A negative test that a slice of a stack array cannot be returned.

## Drawbacks

- A structural protocol means a type can be iterable by accident if it has those two methods.
- A slice into a growing `List` buffer needs care: growing reallocates, so the rule for an existing view must be stated.
- Interior-pointer lookup in the collector has a cost that must be measured.

## Alternatives

- **A `next()` iterator protocol.** More general, but needs state objects and error handling per step. Not chosen for the first version.
- **An `each(f)` method only.** Depends on closures and cannot use `break` or `return` naturally.
- **Keep slices parameter-only.** Safe, but it blocks views into collections and parsers that return pieces of input.

## Unresolved questions

- The final choice between the protocol, `next()` and `each(f)`, made after closures exist.
- What happens to a slice into a `List` when the list reallocates.
- Whether the loop variable is a copy or a view for large element types.
- Whether `Set` iterates in insertion order.
