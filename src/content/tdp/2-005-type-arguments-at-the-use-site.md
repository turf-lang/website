---
major: 2
number: 5
title: Type arguments at the use site
description: Let a program name a generic type's or function's type arguments where it uses them, with `List<int>::default()` and `f::<int>(x)`.
status: accepted
date: 2026-10-15
authors:
  - Turf Team
---

## Summary

A generic type or function is awkward to use when nothing at the call supplies its type arguments. Today `List::default()` fails with E129, `List<int>::default()` fails with E110, and `identity::<int>(3)` fails with E108. This proposal adds two spellings that read well and cannot be mistaken for anything else: `Name<Args>::member` for a type (`mut l = List<int>::default();`), and `name::<T>(…)` for a function or method (`identity::<int>(3)`, `immut g = identity::<int>;`). It also makes the compiler's hints point at them. It changes the meaning of no program that compiles today.

## Motivation

`guess` infers a local's type from its initializer and nothing else. That rule is frozen, and rightly so: a declaration's meaning must not depend on code below it. But it leaves a gap. When the initializer carries no type information, there is no way to supply it in an expression.

What the compiler does today, each line run against the 2.0 compiler:

| Source | Result |
|---|---|
| `mut l = List<int>::default();` | E110: `<` after a name in an expression is always less-than |
| `mut l = List::default();` | E129: nothing to infer |
| `mut l: List<int> = List::default();` | Works, because the declared type supplies the arguments |
| `identity::<int>(3)` | E108: `::` must be followed by a name |
| `mut f = identity;` | E137: no function type to read |

So the only way to build an empty generic collection is to repeat the type on the left of the `=`, and a generic function value cannot be named at all.

## Design

### `Name<Args>::member`

After an identifier or a `module::Name`, a `<` starts a *speculative* type-argument list. The parser commits to it only if the list closes with `>` **immediately followed by `::`**. Otherwise the `<` is less-than, exactly as now.

```turf
mut l = List<int>::default();
mut m = Map<string, List<int>>::default();
mut n = list::List<int>::default();
```

This is safe because `x < y > ::z` is already a syntax error today, so only programs that are rejected now can change meaning. The parser tries a short type list and backs up if it does not close properly. It needs no knowledge of what a name means, so the parser stays free of semantic state. With `guess`, the result is ordinary inference over an explicit type expression.

Next to the long-hand it replaces:

```turf
mut a: List<int> = List::default();
mut b = List<int>::default();
```

Both produce the same type and the same monomorphized code.

### `name::<T>(…)`

`::` followed by `<` cannot begin anything else today (it is E108), so it is free to carry type arguments on functions and methods:

```turf
immut x = identity::<int>(3);
immut y = parser.read::<int>();
immut g = identity::<int>;
```

The last line gives a generic function a function value, which E137 currently refuses. `f<int>(x)` is not proposed: when `int`'s place is a variable it already parses as two comparisons, so it can never be made unambiguous.

### Hints that point at them

E129 and E110 gain a hint that shows the new spelling. Where exactly one spelling would fix the program, the `Fix:` line of [TDP-2-001](/tdp/2-001/) (fixes in diagnostics without a model) offers it. Editor inlay hints for inferred types and a code action "write the inferred type" are the language server's share of the same idea.

### Spellings considered

| Spelling | Verdict |
|---|---|
| `List<int>::default()` | Chosen for types. It matches the type-position spelling, so there is one way to write a type argument. |
| `List::<int>::default()` | Used only where `<` cannot work (functions). |
| `List:int::default()` | Rejected. `:` already means "has type", and nesting such as `Map:string:List:int::default()` is undecidable by eye. |
| `List[int]::default()` | Rejected. `[` is indexing, and the parser cannot tell a type from a value. |
| `List(int)::default()` | Rejected. `(` is a call. |

## Constitution check

- **I. Safe by default, unsafe by declaration.** Not affected. Every check runs after the type is known, and none is weakened.
- **II. Native performance, with costs you can read.** Not affected at run time. Both spellings resolve to the same monomorphized instance as the annotated form, so the generated code is identical.
- **III. The compiler is the authority.** The compiler decides, deterministically, whether `<` begins type arguments, and the rule is stated in one place.
- **IV. Nothing crosses a boundary implicitly.** The type arguments are written where the reader sees them. Nothing is guessed from code further away.
- **V. A few general mechanisms, not many special cases.** `<…>` is the one spelling for a type argument, and `::<…>` covers the one place it cannot appear bare. No special case per standard library type.
- **VI. It works when you install it.** No dependency is added.
- **VII. Stability is a promise.** The change accepts only programs that are syntax errors today. A name used for a local, such as `x < y > z`, parses as before. No new word is reserved.
- **VIII. A claim is not true until it is demonstrated.** A test pair, one annotated and one using the new spelling, is compiled with `--emit-llvm` at every optimization level, and the output must match apart from names and debug locations.

The Non-Goals hold. This asks for no borrow checker and no no-runtime targets, and no model is involved.

## Migration

Nothing breaks. Existing programs keep their meaning. The `: Type` annotation form keeps working, and nothing is deprecated.

## Verification

- An annotated-versus-explicit pair for every new spelling, compared as emitted LLVM at `-O0` through `-O3`.
- A parser test for the ambiguous shapes: `a < b > ::c` still fails, `a < b` and `a < b > c` parse as comparisons, and nested `Map<string, List<int>>::default()` works.
- `TURF_GC_STRESS` runs for the constructors the new spelling reaches.
- A test that identifiers named after a type or function are unaffected.

## Drawbacks

- The parser gains bounded backtracking. It is limited to a short type list, but it is still a new kind of rule for the parser.
- Two places now carry type arguments: after `<` for types and after `::<` for functions. The reason is documented, but a newcomer has to learn both.
- It is another way to say what a declared type already says. The short form stays useful, so both survive.

## Alternatives

- **Do nothing.** Keep repeating the type on the left of the `=`. Rejected: it cannot name a function value at all.
- **Infer from later statements** (`mut l = List::default(); l.push(1);`). Rejected, permanently: a declaration's meaning would depend on code below it.
- **Change `<T>` in type positions.** Rejected: it breaks every program with generics, for no gain once this exists.

## Unresolved questions

- Whether `Name<Args>::member` should also accept a leading `module::` path in every form.
- How the speculative parse reports an error when the list almost closes but not quite.
- Whether the language server's inlay hints belong in this proposal or in the editor tooling one.
