---
major: 2
number: 2
title: Checked arithmetic and auto-vectorization
description: Keep integer overflow trapping by default, remove more of the checks by proof, and give hot loops an explicit way to ask for wrapping.
status: accepted
date: 2026-10-15
authors:
  - Turf Team
discussion: https://github.com/turf-lang/turf-lang/issues/257
---

## Summary

Every `+`, `-` and `*` on an `int` is overflow-checked, and the check is a branch. A measurement on a numeric loop shows that this branch alone stops LLVM from vectorizing the loop, and costs about 53% against `clang -O3`. This proposal keeps the default exactly as it is, and proposes two changes that do not weaken it: widen the cases where the compiler removes a check by proof, and add explicit, call-site wrapping functions (`math::wrapping_add`, `wrapping_sub`, `wrapping_mul`) for the hot loop that accepts wraparound. It does not propose a build flag, and it does not change what any existing program does.

## Motivation

Turf traps on signed overflow in every build and at every optimization level. The code that does it is `EmitCheckedIntArith` in `src/codegen/CodegenCore.cpp`: each operation becomes `llvm.sadd.with.overflow.i64` (or the `ssub` and `smul` forms), then a conditional branch to a block that panics with "Integer overflow".

What that costs in a hot numeric loop is measured below.

### The evidence

The benchmark was `structs`: an array-of-structs integrator, 2000 particles for 20,000 time steps, built with the real LLVM `-O3` pipeline.

- Turf at `-O3` was 53% slower than `clang -O3` on the same program. Every other benchmark in the suite matched or beat `clang -O3`.
- In the disassembly, `clang`'s hot loop used SSE2 vector registers (`paddq`, `movdqa`). Turf's binary used no vector registers anywhere.
- Turf's optimized IR shows why. Every `+` lowers to `llvm.sadd.with.overflow.i64` and a branch to a trap block. Array bounds checks were fully eliminated in this loop, because LLVM could prove the index in range. The overflow checks were not, because the added values come from array loads (`particles[i].x`, `.vx`), and a loaded value has no bound the compiler can use.
- A controlled experiment took the real compiled IR and removed only the overflow-check branches around the two hot additions. The same GEPs, loads and loop structure remained, and the same `-O3` pipeline ran again. `paddq` appeared at once, and the run time fell from about 0.05 s to about 0.03 s, matching C. The output stayed byte-identical.

That isolates the cause to the overflow branch. It is not struct layout, which is flat and has the same GEP shape as the C version, and it is not array indexing.

### Reproducing the number

The program behind the 53% figure is not in the repository yet. The `structs` benchmark in `bench/structs.tr` is a different program and runs at 1.06x C's time, so it cannot stand in for it. Adding the measured program to `bench/` is the first deliverable (see Verification).

### How other languages handle the same tension

| Language | Default | Escape hatch |
|---|---|---|
| C | Signed overflow is undefined behaviour | None needed; this is why C vectorizes freely |
| C# | Unchecked (silent wraparound) | `checked { }` or a compiler option opts in to checking |
| Rust | Checked in debug builds, wrapping in release builds by default | `overflow-checks`, or per call: `checked_add`, `wrapping_add`, `overflowing_add`, `saturating_add` |
| Swift | Checked (traps) in every build mode | `&+`, `&-`, `&*` wrap, per expression |
| Zig | Checked in Debug and ReleaseSafe | Undefined in ReleaseFast and ReleaseSmall (a whole-build switch), or `+%` and `-%` for defined wrapping in any mode |
| Turf today | Checked (traps), always | None |

Turf's default is closest to Swift's. Swift also gives a per-expression way out, and Turf does not.

## Design

The default stays checked. This proposal does not touch it.

### 1. Remove more checks by proof

The compiler already removes a check when it can prove the operation cannot overflow, and never because of a flag. `ValueRangePass::markElidableChecks()` runs a constant-propagation dataflow before code generation and marks operations that cannot overflow (`ProvenNoOverflow`). The `(i % 5) - 2` expression in the same benchmark has no check for this reason.

The proposal is to extend that analysis from constants to ranges, and to loop-carried values: loop counters bounded by the loop condition, values reduced by `%` or masked, and sums of such values. A check removed this way changes nothing observable and needs no opt-in.

It should be said plainly what this will not do. A value read from memory has no range the analysis can know, so a sum of array elements, which is the `structs` loop, is not helped by it. This direction is worth doing because it removes real checks from counters and indices with no cost to anyone. It is not expected to close the gap that the measurement found.

### 2. Explicit wrapping at the call site

For the loop that needs it, three functions in `math`:

```turf
fn wrapping_add(a: int, b: int): int
fn wrapping_sub(a: int, b: int): int
fn wrapping_mul(a: int, b: int): int
```

They compute the two's complement result modulo 2^64 and never trap. A hot loop that accepts wraparound is written with them:

```turf
x = math::wrapping_add(x, vx);
```

Functions, and not new operators, for these reasons:

- No grammar change, and nothing to learn that does not already work like a function.
- The wrapping is visible and searchable at the place it happens (Principle IV).
- The `+` operator keeps one meaning everywhere.

How the compiler learns that these functions are special has to follow Principle V: from the declaration, through the same mechanism any library can use, and not from the function's name. If that mechanism does not exist yet in a form that can express this, building it is part of this work and is described in the unresolved questions.

Wrapping is not undefined behaviour. The result is defined for every input, so the language stays free of UB.

### 3. Not proposed: a global flag

A flag such as `-fwrapping-arithmetic` would make the same source mean different things in different builds. Turf's semantics do not depend on how a program was built, and this proposal keeps it that way.

### 4. Not proposed now: batch-then-check

One idea: compute a batch of additions without checks, combine the overflow flags, and branch to the trap once per batch. It would keep the guarantee that overflow always traps. It is not proposed here because it can change what a program does before the panic. A store that comes after the overflowing element in the batch may already have been performed when the trap fires, and the panic location must still name the right element. That is observable, and an optimization must never change what a program does. It might be sound for loops whose body has no other effects, such as pure reductions, and could come back as its own proposal with a precise rule for when it applies.

### Wording of the overflow rule

The language rule is that signed integer overflow traps and is never wrapping and never undefined. The `wrapping_*` functions do not make an overflow wrap: they are a different operation that is defined to wrap. The rule should be worded to say so, so that nobody reads it as forbidding them.

## Constitution check

- **I. Safe by default, unsafe by declaration.** The default is unchanged. Wrapping is explicit at each use. Wrapped integers cannot corrupt memory, and an array index computed from one is still bounds-checked.
- **II. Native performance, with costs you can read.** This is the motivation. A reader can see a `wrapping_add` call and know that no check is made, and a plain `+` and know that one is. The claim is backed by a measurement that will be published as a benchmark, and a regression against it is a bug.
- **III. The compiler is the authority.** Checks are removed only by proof the compiler derives deterministically. The same source gives the same result at every optimization level.
- **IV. Nothing crosses a boundary implicitly.** Wraparound is never implicit. It is a named call at the place it is wanted, and `+` is never silently turned into a wrapping add.
- **V. A few general mechanisms, not many special cases.** The wrapping functions must be declared to the compiler by the general declaration mechanism, not recognized by name. See the unresolved question.
- **VI. It works when you install it.** Nothing to install or configure. There is no flag.
- **VII. Stability is a promise.** Every existing program behaves as before. The change only adds names to `math`. The wording of the overflow rule is clarified, not reversed.
- **VIII. A claim is not true until it is demonstrated.** The performance claim rests on a checked-in benchmark, and the safety claim on tests that the default `+` still traps and that the wrapping functions do not.

The Non-Goals hold. This asks for no borrow checker, no no-runtime target, and no AI in compilation.

## Migration

Nothing breaks. No existing program changes behaviour, and no existing name is taken: the new functions live in `math` and are reached as `math::wrapping_add`. A program that already defines its own `wrapping_add` in its own module is not affected, because it is a different module's name. The reference page for operators and integer overflow gains a section on the new functions, and the reference states the overflow rule with the wrapping functions as its one explicit exception.

## Verification

- Check in the benchmark that produced the 53% figure, with its C twin, under `bench/`, so the baseline can be repeated. Record the result with the other benchmarks.
- With the benchmark rewritten to use the wrapping functions in its two hot additions, show in the disassembly that the loop vectorizes and that the time reaches the C twin's, with a byte-identical checksum.
- A test that `a + b` on `int` still panics on overflow at every `-O` level, and that `math::wrapping_add(INT_MAX, 1)` returns `INT_MIN` at every level.
- For range-based removal: tests that a check is removed where the range proves safety, and kept where it does not, by inspecting the emitted IR, and a fuzz run to confirm results are identical with elision on and off (turf-fuzz already compares levels).
- The sanitizer and `-O0` runs of the suite pass.

## Drawbacks

- A new way to get a number wrong. A programmer can call `wrapping_add` where they should not. The default is still safe, and the call is visible in review, but it is a sharp tool.
- Range analysis is more compiler to maintain, and a mistaken range would silently remove a check that was needed. This is the worst failure in the proposal, which is why the verification compares results with elision on and off.
- Direction 1 may not help the benchmark that motivated this, so the proposal's main benefit comes from direction 2, which asks the programmer to act.

## Alternatives

- **Do nothing.** Keep the cost and say so in the documentation. The cost is real and measured, and it falls on exactly the users Turf's performance claim is for.
- **A global flag (`-fwrapping-arithmetic`).** Rejected, as above: it makes semantics depend on the build.
- **Swift-style operators (`&+`, `&-`, `&*`).** Shorter to write. `&` already means bitwise and and also marks references in types, and a new token adds grammar for something that a function does as well. Left open if the functions prove too heavy to read in numeric code.
- **Wrapping by default in optimized builds, like Rust's release mode.** Rejected: semantics would vary with optimization level.
- **Make overflow undefined, like C.** Rejected: Principle I.
- **Batch-then-check.** Deferred, with the reason given above.

## Unresolved questions

- How are the wrapping functions declared so that the compiler treats them specially without recognizing their name? The compiler's intrinsic registry has three kinds today (language-level intrinsics, LLVM intrinsics, runtime entry points), and none is "a module function the compiler lowers specially". The smallest addition that keeps Principle V is a fourth kind in the same registry, keyed by the module and function of the *resolved declaration*, so a program that defines its own `wrapping_add` gets its own function. That is a closed-list change, so it needs a change record, which together with this proposal is the deliberate, published change. At `-O0` a call must still lower to a plain `add`, `sub` or `mul` with no overflow flag, never to a real call.
- Should there be `int32` forms, given `int32` exists only for ABI declarations?
- What about shifts and negation, which are also checked (`EmitCheckedShl`, `EmitCheckedIntNegate`)? Probably out of scope until a measurement shows the same effect.
- Is interval analysis enough for direction 1, or does it need induction-variable reasoning, and is the added compile time acceptable?
- Is there a safe, narrow form of batch-then-check worth its own proposal?
