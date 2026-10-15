---
major: 3
number: 1
title: Threads and shared state
description: Add threads to Turf with a share-nothing default, transferable arguments, and shared state only through library types, designed so it never needs a major version.
status: draft
date: 2026-10-15
authors:
  - Turf Team
---

## Summary

Turf programs run on one thread today. This proposal designs threads for the first 3.x minors. The model is **share nothing by default**: a new thread starts from a function and a *transferable* argument, and state is shared only through library types (`Mutex<T>`, atomics, channels) whose unsafe core lives in the standard library. It specifies a thread-aware runtime with a fast path that costs a single-threaded program nothing, a `thread` module (`spawn`, `join`, `sleep`, thread-local storage), and a `sync` module. The rules apply only to code that starts a thread, so no program that compiles on 3.0 is rejected.

## Motivation

Concurrency is the most requested missing capability, and it is also the one that presses on the most guarantees at once:

- **The collector.** It is single-threaded, non-moving, stop-the-world and conservative on stacks and registers. Threads need per-thread stack bounds, register capture and a handshake.
- **Safe code cannot corrupt memory.** A data race on a shared list corrupts memory. The guarantee must hold for safe code that uses threads.
- **Collections are shared and copied on demand.** Two threads sharing a `List<T>` without a rule would break that behaviour in safe code.
- **No trait system.** The mechanism that would express "this type may cross threads" in other languages is rejected here, so the rule must be something else.

## Design

### The sharing model

**Share nothing by default.** `spawn` takes a function value and one *transferable* argument. Transferable is a structural predicate the compiler knows: primitives, strings, and value structs and arrays whose parts are transferable. A collection or a reference is not transferable. It is either deep-copied at the call, as a collection already is on demand, or rejected, and the error says which and why.

```turf
import thread;

fn work(n: int): int {
    return n * n;
}

fn main() {
    immut t = thread::spawn(work, 12);
    printline(t.join());
}
```

Shared state exists only through standard-library types:

| Type | Purpose |
|---|---|
| `Mutex<T>`, `RwLock<T>` | Guard a value so one thread, or many readers, can touch it |
| Atomics | A closed, intrinsic list of atomic operations, like the collector's |
| Channels | Move values between threads |

Their `unsafe` core is inside the standard library and nowhere else, so a program using them contains no `unsafe`.

### Staging

| Step | Version | What |
|---|---|---|
| Design | 3.1 | This design is accepted before any implementation |
| Runtime | 3.1 | A **thread-aware runtime** with no user-visible threads yet |
| Threads | 3.1 | The `thread` module |
| Synchronisation | 3.2 | The `sync` module |

### The runtime

The runtime work provides per-thread stack bounds and register capture, a stop-the-world handshake, allocation through per-thread buffers (the collector work of 2.5), and thread-safe panic and signal handlers. Its key rule is the **single-thread fast path**: locks and handshakes are compiled out until the first thread starts, so a single-threaded program pays no cost, and the benchmark floor must hold.

### Closures and `thread`

The entry function is a function value ([TDP-2-009](/tdp/2-009/), closures and function values). Before closures, it is a named function plus a transferable argument, as above.

### Staying additive

Concurrency ships in a 3.x minor, so a rule that rejected a program compiling on 3.0 would need 4.0. The design therefore applies its checks **only to code that starts a thread**. A program that never calls `spawn` is not affected by any of them.

## Constitution check

- **I. Safe by default, unsafe by declaration.** Safe code using threads cannot race, because nothing is shared except through library types that guard it. The `unsafe` is confined to the standard library.
- **II. Native performance, with costs you can read.** A single-threaded program pays nothing, and the fast path is a stated requirement. A thread's argument copy is visible at the `spawn` call.
- **III. The compiler is the authority.** The compiler decides what is transferable from a structural rule and explains each rejection.
- **IV. Nothing crosses a boundary implicitly.** A thread boundary is a `spawn` call with a transferable argument. A copy at that boundary is documented, and sharing needs a named library type.
- **V. A few general mechanisms, not many special cases.** There is one predicate for crossing a thread, and no `Send` or `Sync` trait system is needed. Library types, not new syntax, carry sharing.
- **VI. It works when you install it.** Threads need no external library.
- **VII. Stability is a promise.** No program that compiles on 3.0 is rejected, and no new reserved word is added. `thread`, `spawn` and `lock` stay valid identifiers.
- **VIII. A claim is not true until it is demonstrated.** The runtime ships with stress tests under the collector's stress mode, race tests with a thread sanitiser, and the benchmark floor.

The Non-Goals hold. A transferable rule is not a borrow checker. No no-runtime targets are asked for, and no model is involved.

## Migration

Nothing breaks. A program that does not start a thread is unchanged, and no existing code needs to change.

## Verification

- Collector stress tests with several threads, run under the stress mode and the address sanitiser.
- A thread sanitiser run over the `thread` and `sync` modules.
- A benchmark showing the single-thread fast path matches the 2.x baseline within the noise.
- Tests of each transferable and non-transferable argument and of the error text.
- A test that a program using `spawn` as a variable name compiles and runs.

## Drawbacks

- A share-nothing model copies data across threads, which costs time for large values. Channels and `Mutex<T>` exist for sharing deliberately.
- The runtime work is large and touches the collector, which is the riskiest part of the system.
- Users from languages with shared memory by default may find it restrictive.

## Alternatives

- **Share by default with a type-level marker.** Rejected: it needs the trait-like system the language does not have.
- **Green threads only.** Possible later as the async library ([TDP-3-002](/tdp/3-002/), async and non-blocking I/O), but they do not replace OS threads for parallel work.
- **No concurrency.** Leaves a major gap.

## Unresolved questions

- The exact definition of transferable for structs that contain collections.
- Whether `spawn` accepts more than one argument, or a tuple.
- The handshake design: safepoints or signals.
- Whether a generational collector, after threads, changes any of these rules.
