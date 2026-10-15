---
major: 2
number: 15
title: Runtime debug checks
description: Add an opt-in build mode that catches misuse of the manual heap with a named panic, and turn it on by default at `-O0` in 3.0.
status: proposed
date: 2026-10-15
authors:
  - Turf Team
---

## Summary

Safe Turf code cannot corrupt memory, but `unsafe` code can, and such errors show up far from their cause. This proposal adds an opt-in checking mode, `turf build --debug-checks` and `turf test --debug-checks`, that watches the manual heap: red zones around `mem::alloc` blocks, poison on `mem::free`, double and invalid frees, `mem::copy` and `mem::set` bounds when the block size is known, and reads of manual-heap memory that was never written. A violation panics with a named diagnostic and exit status 134. In 2.x the mode is off by default. In 3.0 it is on by default at `-O0`.

## Motivation

A memory error in `unsafe` code usually does not fail where it happens. A write past the end of a block corrupts a neighbour, and the program fails later in unrelated code. A use after free reads plausible data until the memory is reused. Tools such as the address sanitizer find these, and the project already uses them in testing, but a library author checking an `unsafe` core needs the same help from `turf test` with no extra setup.

A library that wraps C must keep every `unsafe` line inside itself ([TDP-2-018](/tdp/2-018/), safe library interfaces). That promise is only as good as the testing behind it. This mode is that testing.

## Design

### The mode

`--debug-checks` builds on the runtime sanitiser hook that already exists. It changes how the manual heap works, and only the manual heap. Garbage-collected memory is checked by safe code already.

| Check | What it catches |
|---|---|
| Red zones | A write just before or after a `mem::alloc` block |
| Poison on free | A read or write to a block after `mem::free` |
| Double free, invalid free | Freeing twice, or freeing a pointer that did not come from `mem::alloc` |
| Copy and set bounds | `mem::copy` or `mem::set` past a block whose size is known |
| Uninitialised read | Reading manual-heap memory that was never written |

A violation panics with a message that names the check, the block and the allocation site, and exits with status 134, the abort status used for other runtime panics.

```text
panic: heap check failed: write past the end of a block
  block of 16 bytes allocated at buffer.tr:21
  written at buffer.tr:34
```

### Cost and scope

The mode is meant for tests and debugging. It makes allocation slower and uses more memory. It does not change the behaviour of a correct program: output and exit statuses are the same. It is off by default in 2.x so that no existing program's speed or memory changes.

### On by default at `-O0`

In 3.0 the mode is on by default at `-O0`, since that is the level used when debugging. A program with latent memory corruption will then start panicking in a debug build, which is the aim. `--no-debug-checks` turns it off. Optimised builds are unaffected.

## Constitution check

- **I. Safe by default, unsafe by declaration.** This is a check inside `unsafe` code. Safe code is never affected, and the manual heap is the part that is unsafe by declaration.
- **II. Native performance, with costs you can read.** The cost is explicit and opt-in: a flag names it. Without the flag the allocator is unchanged. At `-O0` in 3.0 the cost is accepted for debug builds.
- **III. The compiler is the authority.** The checks are part of the runtime the compiler builds, and every failure is a named, deterministic panic.
- **IV. Nothing crosses a boundary implicitly.** The mode covers the manual heap, the boundary between safe and unsafe memory, and reports a violation there by name.
- **V. A few general mechanisms, not many special cases.** One mode, one switch, one panic form.
- **VI. It works when you install it.** No external sanitiser is needed. `turf test --debug-checks` works on a plain install.
- **VII. Stability is a promise.** Default off in a minor. A program relying on undefined behaviour may panic only under the opt-in mode, as the contract allows. Default-on is a 3.0 item with a documented opt-out.
- **VIII. A claim is not true until it is demonstrated.** Each check has a test that triggers it and a test that a correct program is unaffected.

The Non-Goals hold. This is a runtime check and not a borrow checker. It asks for no no-runtime targets, and no model is involved.

## Migration

In 2.x nothing breaks, since the mode is opt-in. In 3.0 a debug build of a program with a hidden memory error will panic. The migration is to fix the error, which is the purpose, or to pass `--no-debug-checks`.

## Verification

- A test for each check that triggers the panic with the expected text and status.
- A test that a correct manual-heap program gives identical output with and without the flag.
- Runs of the standard library's own `unsafe` parts under the mode.
- A measurement of the mode's slowdown, recorded so the 3.0 decision uses numbers.
- A check that the default build's allocator and benchmarks are unchanged in 2.x.

## Drawbacks

- The mode adds time and memory, and some errors still slip through. It is a check, not a proof.
- A program that works today by luck will fail at `-O0` in 3.0.
- Poison and red zones need care so that C code that is handed a block is not confused by them.

## Alternatives

- **Rely on external sanitisers.** They are used in testing, but they need setup that a library author should not need.
- **Default on in every build.** Rejected: it would slow optimised builds and break the 2.x promise.
- **Do nothing.** Hidden errors stay hidden.

## Unresolved questions

- The size of red zones and the fill pattern for poison.
- How the mode handles memory passed to and freed by C.
- Whether uninitialised-read detection costs too much to include in the first version.
- What `-O1` and above do by default in 3.0.
