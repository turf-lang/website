---
major: 2
number: 10
title: Generic inference from arguments and return types
description: Infer a generic struct's type arguments from a constructor's arguments, allow type parameters that appear only in a return type, and add constructors that carry their element type.
status: accepted
date: 2026-10-15
updated: 2026-10-16
authors:
  - Turf Team
---

## Summary

A generic function already infers its type parameters from its arguments. A generic struct does not: `Box::new(42)` fails with E129 although `42` plainly says `T` is `int`. This proposal makes three changes that all keep inference local, one-directional and inside a single expression. A struct's type arguments are inferred from a constructor's arguments. A type parameter that occurs only in a return type becomes usable when each call states it. And `List::from` and `Set::from` carry their element type. `guess` itself stays as it is: it reads only the initializer, never a later statement.

## Motivation

Today, with `fn<T> Box.new(v: T)`:

| Source | Result |
|---|---|
| `mut b = Box::new(42);` | E129, although `T` is in the parameter list |
| `mut b: Box<int> = Box::new(42);` | Works: the declared type supplies the argument |
| `fn<T> make(): T` | E129 at the declaration, because `T` cannot be inferred |

A generic function call infers `T` from its arguments. A generic struct constructor is the same shape of call and should behave the same way. The declared-type workaround repeats information the right-hand side already contains.

## Design

### The frozen rules this works inside

- **Model B stays rejected.** `mut l = List::default(); l.push(1);` would make a declaration depend on later code, so the element type cannot come from a later statement.
- **`guess` is never for parameters, return types or fields.** Public signatures stay explicit.
- **Everything below gives the initializer enough information.** That costs nothing at run time, because the type is fully known before code generation.

### Type arguments from constructor arguments

When no declared type supplies a struct's type arguments, they are inferred from the arguments of the constructor, exactly as for a generic function. Every type parameter must occur in the parameter list, and the arguments must agree.

```turf
mut b = Box::new(42);
mut p = Pair::new("a", 1);
```

`b` is `Box<int>` and `p` is `Pair<string, int>`. A literal takes its `guess` default first, so `42` is an `int`. A declared or expected type still wins when it is present, and a disagreement between it and the arguments is the existing E056. `List::default()` has no argument to read, so it still needs the use-site spelling of [TDP-2-005](/tdp/2-005/) (type arguments at the use site).

This narrows one clause of the `guess` rules, the one that says `guess` never applies to a generic type argument. Only that clause changes.

### Type parameters only in the return type

A function such as `fn<T> make(): T` or `fn<T> parse(text: string): !T` is accepted. Each call must state the type through an expected type or an explicit argument:

```turf
mut a: int = make();
mut b = make::<int>();
mut c = make();
```

The first two work. The third stays E129, by design, but the error moves from the declaration to the call that has neither. This accepts more programs than before and rejects none that compiled.

This touches overload resolution, so it needs a written design note before implementation.

### Constructors that carry the element type

`List::from(items: T[])` and `Set::from(items: T[])` are new items in existing modules. With that, `mut l = List::from([1, 2, 3]);` is `List<int>`. Before promising this, the work must confirm that an array literal converts to a slice parameter.

### Considered and not proposed

- **Inferring from later statements.** Rejected permanently.
- **`List<guess>` partial annotations.** Redundant once use-site spelling and constructor inference exist.
- **Default type arguments** (`List<T = int>`). Rejected: it hides cost and defeats reading the type at the use.
- **Wider integer promotion on overflow.** Rejected: there is no wider type.

## Constitution check

- **I. Safe by default, unsafe by declaration.** Not affected. Every bounds, overflow, nullability and escape check runs after the type is fully known, so none is weakened.
- **II. Native performance, with costs you can read.** Not affected. Each form resolves to the same monomorphized instance as the annotated spelling, so generated code is identical.
- **III. The compiler is the authority.** Inference is a deterministic rule with a stated limit, and the error for "nothing to infer" says where an argument is needed.
- **IV. Nothing crosses a boundary implicitly.** Inference stays within one expression. It never reaches across statements, and public signatures stay explicit.
- **V. A few general mechanisms, not many special cases.** A constructor call infers exactly as a function call does. There is no special rule per type.
- **VI. It works when you install it.** No dependency.
- **VII. Stability is a promise.** All three changes accept programs that are errors today and change none that compile. E129 moves for return-only parameters, which were already rejected.
- **VIII. A claim is not true until it is demonstrated.** For each form, a test pair, annotated and inferred, is compiled with `--emit-llvm` at every optimization level and the output must match.

The Non-Goals hold. This asks for no borrow checker and no no-runtime targets, and no model is involved.

## Migration

Nothing breaks. Annotated forms keep working, and no program is required to change.

## Verification

- Annotated-versus-inferred pairs for `Box::new`, `Pair::new` and `List::from`, compared as LLVM at every level.
- A test that a disagreement between an expected type and the arguments is E056.
- A test that `mut x = make();` stays E129 and `mut x = make::<int>();` works.
- `TURF_GC_STRESS` runs for the new constructors.
- A check that an `int[3]` literal converts to the slice parameter of `List::from`.

## Drawbacks

- Inference rules are another thing to learn, and the limit (arguments only, never later code) must be explained clearly.
- The return-type rule changes where an error is reported, which can surprise someone who knew the old message.
- Overload resolution gets more complex.

## Alternatives

- **Do nothing.** Keep writing the type on the left. Rejected: it is redundant where the arguments already say it.
- **Whole-function inference.** Rejected: a declaration would depend on code below it, and code generation would need whole-function typing first.
- **Require the use-site spelling every time.** Rejected: `Box::new(42)` is clear without it.

## Unresolved questions

- The precise rule when arguments agree only after literal defaulting, for example `Pair::new(1, 2.0)`.
- Whether the return-type rule allows a return-only parameter inside a nested expected type, such as `!T`.
- The wording of the new E129 at the call.
