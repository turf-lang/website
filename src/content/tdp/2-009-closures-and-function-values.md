---
major: 2
number: 9
title: Closures and function values
description: Add anonymous functions that can capture variables, passed and stored as function values, in four phases from capture-free to stack-allocated environments.
status: proposed
date: 2026-10-15
authors:
  - Turf Team
---

## Summary

Turf has named functions and function pointers, but no way to write a function inline that uses a variable from where it is written. This proposal adds closures in four phases. First, capture-free anonymous functions that are as thin as a function pointer. Second, closures that capture variables, represented as a pair of code and environment. Third, adoption in the standard library (`map`, `filter`, a closure-based `http` router). Fourth, an optimisation that keeps the environment of a non-escaping closure on the stack. It also settles the spelling of an array of function values, and lets a lambda's parameter types come from where it is used.

## Motivation

Without closures, anything that takes behaviour as an argument needs a named function defined elsewhere, and cannot carry state with it. `List.map` and `filter` cannot be written in a way people expect. A router cannot register a handler that uses the server's configuration. Concurrency ([TDP-3-001](/tdp/3-001/), threads and shared state) wants to pass a function and its data to a new thread.

There are also two known rough edges:

- `mut f = identity;` fails with E137 because there is no function type to read.
- An array of function values has an unfortunate spelling: `fn(int): int[2]` means a function returning an array, not an array of functions.

## Design

### Phase 1: capture-free lambdas

An anonymous function that uses nothing from its surroundings is as thin as a function pointer.

```turf
immut double = fn(x: int): int { return x * 2; };
```

It is parsed and lowered as an ordinary function with no name. Because it has no environment, its size is a single pointer, and **function values in `extern` struct fields stay the size they are today**. This phase decides that layout question before anything larger depends on it.

### Phase 2: closures with captures

A lambda that uses a local variable captures it. A function value becomes a pair, `{code, env}`, with a type descriptor so the collector can find pointers in the environment.

```turf
fn make_adder(n: int): fn(int): int {
    return fn(x: int): int { return x + n; };
}

immut add5 = make_adder(5);
printline(add5(10));
```

Captures are by value for values and by reference for heap objects, as everything else in Turf already behaves. A closure's environment is a garbage-collected block, so a closure may outlive the function that made it. A closure never captures a stack address that could dangle: a capture of a local that must not escape is an error. This keeps the guarantee that safe code cannot corrupt memory.

### Phase 3: stdlib adoption

Once closures exist the standard library uses them: `List.map`, `List.filter`, `List.each`, and a router in `http` that takes a closure as a handler. These are new `pub` items in existing modules and follow the usual API lock.

### Lambda types from context

When a lambda is passed where a function type is expected, its parameter and return types are read from that type.

```turf
immut doubled = items.map(fn(x) { return x * 2; });
```

`x` is read from the callee's `fn(T): R` with `T` fixed by the receiver. A lambda with no expected type, such as `mut f = fn(x) { … };`, still fails like any other `guess` with nothing to infer. The fully annotated form stays valid. This relaxes the rule against `guess` in a signature for lambdas only, because a lambda is an expression with a known context and not a declaration with a public signature.

### Arrays of function values

The additive fix is a parenthesised type or an alias, for example `(fn(int): int)[2]`. Changing the meaning of `fn(int): int[2]` is a breaking change and is not proposed, since the additive spelling is enough.

### Phase 4: stack environments

An environment of a closure that does not escape is placed on the stack. This is done on the compiler's lowering IR, which arrives in the same line, and is unobservable.

## Constitution check

- **I. Safe by default, unsafe by declaration.** A closure can never hold a dangling reference. A capture that could outlive its source is rejected, or its environment lives on the garbage-collected heap.
- **II. Native performance, with costs you can read.** A capture-free lambda costs a pointer. A capturing closure allocates an environment, which is visible in the type: a function value is `{code, env}`. Phase 4 removes the allocation when escape analysis proves it unneeded.
- **III. The compiler is the authority.** The compiler decides what is captured and how, from the lambda's body, deterministically.
- **IV. Nothing crosses a boundary implicitly.** Captures are the variables the body names, readable in the source. A function value crossing into C is the thin form only.
- **V. A few general mechanisms, not many special cases.** One function-value type serves callbacks, `map`, routers and threads. There is no separate "callback" or "handler" form.
- **VI. It works when you install it.** No extra dependency.
- **VII. Stability is a promise.** All of this is additive syntax. `fn` followed by `(` in expression position is rejected today. The layout of an existing function value in an `extern` struct does not change.
- **VIII. A claim is not true until it is demonstrated.** Each phase ships with tests under `TURF_GC_STRESS`, and phase 4 with a differential test of the generated code.

The Non-Goals hold. A borrow checker is not added: a capture is a value or a collected reference. The proposal asks for no no-runtime targets, and no model is involved.

## Migration

Nothing breaks. Existing function pointers, function values and `extern` structs keep their layout. The arrays-of-functions spelling problem is fixed additively.

## Verification

- A test for each capture form, run under `TURF_GC_STRESS` and the address sanitizer, to show the environment survives its creator.
- A test that a capture of a non-escaping local is rejected when it would dangle.
- A layout test that a capture-free lambda in an `extern` struct has the same size as a pointer.
- For phase 4, a differential test that a stack environment and a heap environment give identical results.

## Drawbacks

- A function value is larger once captures exist, and calling it is an indirect call with an environment.
- Closures make it possible to build reference cycles, which the collector handles but a reader may not expect.
- It is a large feature with four phases, and each needs its own measurement.

## Alternatives

- **Named functions only.** The status quo. Rejected: it blocks `map`, routers and threads from being written in the natural way.
- **Capturing by reference everywhere.** Rejected: it would allow a dangling capture.
- **A separate `callback` type.** Rejected under Principle V: a second function-like type duplicates the mechanism.

## Unresolved questions

- The exact rule for which captures are by value and which by reference, stated precisely enough for a reference page.
- Whether a closure may be compared or hashed.
- The spelling used in error messages for the `{code, env}` pair.
- Whether phase 1 ships a minor earlier than phase 2.
