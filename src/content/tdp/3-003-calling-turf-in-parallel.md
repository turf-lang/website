---
major: 3
number: 3
title: Calling Turf in parallel from other runtimes
description: "On the thread-aware runtime, let a Turf library be entered by many host threads at once, safely, and give the JVM, .NET, Go and Erlang/Elixir generated bindings: `turf-jvm`, `turf-dotnet`, `turf-go` and `turf-beam`."
status: draft
date: 2026-10-25
authors:
  - Turf Team
---

## Summary

From 2.9 any thread may call a Turf library, one at a time ([TDP-2-030](/tdp/2-030/)). That is safe but serial, and runtimes built on thread pools (the JVM, .NET, Go, the BEAM) want their calls to run in parallel. On the thread-aware runtime ([TDP-3-001](/tdp/3-001/)) this proposal adds **parallel entry**:

- A library opts in with `[lib] entry = "parallel"`. Host threads then run Turf code at the same time.
- Each foreign thread is registered with the collector on its first call.
- Only threads currently inside Turf take part in a collection.
- A handle is locked for the length of each call, so two threads never use one Turf object at once unless its type is safe to share.

Four generator repositories, built on the export description, give those languages idiomatic bindings. It ships in 3.3, after threads (3.1) and `sync` (3.2).

## Motivation

Java, Kotlin, C#, Go, Erlang and Elixir run most of the world's servers. Each can call a C ABI, so each can call a Turf library from 2.9, but serially. A JVM service with fifty request threads calling a Turf parser would run its parses one at a time. These hosts also want bindings in their own idiom: try-with-resources, `SafeHandle`, Go cleanups, Erlang resources. They should not have to write raw FFI against a C header.

## Design

### Why parallel entry is safe in Turf

Two Turf calls on different threads can only race on memory both can reach. In Turf that is little:

- **No mutable globals in Turf code.** A top-level `mut` is E087, and module constants are `immut`. Two exported calls share no Turf state unless it is passed in. The runtime's own process-wide state (the `random` module's generator in `turfrt_sys.c`, the allocation statistics) is made thread-safe by TDP-3-001's runtime work, which this proposal depends on.
- **Arguments are copied or borrowed per call.** Strings are copied in. A `Slice` is a view valid for one call, which the host must not change during the call, as every C ABI already requires.
- **Handles are the one shared thing.** Two host threads holding the same handle could reach the same Turf object at once. So, by default, the runtime locks a handle for the length of any call that receives it. Calls on different handles run in parallel, and calls on the same handle queue.
- **A type safe to share opts out of the lock** by being built only from TDP-3-001's shareable types (`Mutex<T>`, `RwLock<T>`, atomics, immutable values). The compiler checks that structurally, the same predicate `thread::spawn` uses, and marks the handle `shared` in the export description.

### The runtime

- **Entry modes.** `[lib] entry = "serial"` is the 2.9 behaviour and stays the default. `entry = "parallel"` needs a 3.3 compiler.
- **Registering threads.** A foreign thread's first entry registers its stack bounds with the collector. It is unregistered when the thread exits, through a thread-local destructor (`pthread_key_create`, and `DLL_THREAD_DETACH` on Windows), or explicitly with `<package>_detach_thread()`.
- **Collections.** Stop-the-world handshakes include only threads that are inside Turf at that moment. A thread outside Turf holds nothing but rooted handles, so the collector ignores it. A thread that arrives during a collection waits at the entry.
- **The single-thread fast path.** It holds as TDP-3-001 requires: a `serial` library, or a `parallel` one entered by one thread, compiles out the handshakes and locks it does not use.

### Generated bindings

Each tool lives in its own repository and reads only the export description and the built library.

| Tool | Host | Calls through | Handles | Slices | Errors | Packaging |
|---|---|---|---|---|---|---|
| `turf-jvm` | Java, Kotlin | Panama FFM (Java 22+) | `AutoCloseable` plus a `Cleaner` | Off-heap `MemorySegment` without copy; Java arrays copied | Exceptions per error | A JAR with native libraries per platform |
| `turf-dotnet` | C#, F# | `LibraryImport` source generator | `SafeHandle` subclasses | `Span<T>` pinned for the call | Exceptions per error | A NuGet package with `runtimes/<rid>/native` |
| `turf-go` | Go | cgo | Go types with `runtime.AddCleanup` and `Close()` | Go slices, per cgo's pointer rules | `(T, error)` returns | A Go module with prebuilt static libraries |
| `turf-beam` | Erlang, Elixir | NIFs on dirty CPU schedulers | Resource objects with destructors | Binaries | `{error, Reason}` tuples | A Hex package |

Notes for each host:

- **JVM.** Virtual threads are pinned to their carrier during a native call, which is correct here. A call may receive a Java heap array without a copy only if it is marked short and makes no callback (FFM's critical calls).
- **.NET.** A call that can call back into .NET keeps arguments pinned for its whole length.
- **Go.** cgo forbids C, and so Turf, from keeping a Go pointer after a call returns. Turf's call-scoped `Slice` rule is the same rule.
- **BEAM.** Every Turf NIF runs on a dirty scheduler by default, since a Turf collection can last longer than the 1 ms a normal scheduler may be held. `@export(fast)` marks a function the author has measured as short.

## Constitution check

- **I. Safe by default, unsafe by declaration.** Parallel entry cannot create a data race in Turf code: there are no mutable globals, and handles are locked unless their type is structurally shareable. Each generator holds its host's `unsafe` FFI code; its users write none.
- **II. Native performance, with costs you can read.** Parallel entry exists for throughput. The cost of a handle lock is documented per call, and a shareable type avoids it.
- **III. The compiler is the authority.** Whether a type is shareable is the compiler's structural check, the one `thread::spawn` uses.
- **IV. Nothing crosses a boundary implicitly.** Parallel entry is an explicit manifest setting; a shared handle is marked in the export description.
- **V. A few general mechanisms, not many special cases.** It reuses TDP-3-001's runtime and shareability predicate, and the export description of TDP-2-030.
- **VI. It works when you install it.** Each generator's package carries prebuilt native libraries.
- **VII. Stability is a promise.** Additive in a 3.x minor; `serial` stays the default, so no library changes behaviour.
- **VIII. A claim is not true until it is demonstrated.** See Verification.

The Non-Goals hold: no borrow checker (shareability is a structural type predicate, not ownership analysis), no no-runtime target, no AI in the compilation path.

## Migration

Nothing breaks.

## Verification

- **The runtime.** Under ThreadSanitizer and `TURF_GC_STRESS`, 64 foreign threads calling a `parallel` library: distinct handles in parallel, a shared handle serialized, a shareable handle in parallel, threads exiting mid-run and being unregistered, collections during entry storms.
- **The fast path.** The benchmark floor holds for a `serial` library and for a `parallel` one entered from one thread.
- **Each generator.** A conformance suite of one call per conversion row, run from a thread pool on each Tier 1 platform; handles released by the host collector; errors mapped.

## Drawbacks

- **A per-handle lock** costs an uncontended atomic per call on a non-shareable handle.
- **Four more repositories**, each tracking a host runtime's release cycle.
- **Dirty schedulers by default** on the BEAM add a scheduler hop to every call.

## Alternatives

- **Parallel entry for every library, with no lock on handles.** Rejected: two threads using one handle would race in safe Turf code.
- **Keep serial entry and tell hosts to use several processes.** Workable, but it gives up the throughput these hosts exist for.
- **One generic generator with templates per language.** Possible later, if the four share enough. Separate tools first keep each idiomatic.

## Unresolved questions

- Whether a host thread that has never entered Turf must be able to release a handle (the release function itself needs no registration, but it does touch the root table).
- Whether `turf-go` should also offer a pure-Go fallback for platforms without cgo, which would need a different calling mechanism.
