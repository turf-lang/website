---
major: 2
number: 30
title: Calling Turf from other languages
description: "Build a Turf package as a C library: `@export` functions, `turf build --lib` with a generated header, a runtime that starts on first call, handles C can hold safely, Python extension modules and embedding through `turf-python`, and cross-linking with per-target runtimes."
status: draft
date: 2026-10-25
authors:
  - Turf Team
---

## Summary

Today C can call Turf only through a callback that Turf handed it first, and only from inside a Turf program. This proposal lets a Turf package be built as a static or shared library that any language with a C FFI can load:

- `@export` on a function gives it a C symbol and a C signature.
- `turf build --lib` writes the library and a C header.
- The runtime starts itself on the first call, scans the right stack, and refuses a second thread with a named error until the thread-aware runtime (3.1).
- A Turf object handed to C becomes a handle the collector keeps alive until C releases it. A released or forged handle coming back is a named panic, not a corrupted heap.
- `turf-python`, its own repository, builds a CPython extension module from a Turf library and lets Turf code call Python.
- C++ and Rust call Turf through the same header.
- `--target` links a runnable program or library for another supported platform, using per-target runtimes.

Everything here is additive. It ships in 2.9, before 3.0, because the exported ABI and how the runtime starts inside a host process are the decisions most likely to need a correction that only a major version can make.

## Motivation

Python grew by being easy to embed and easy to extend. A fast core written in a compiled language and imported from Python is how numpy, Pydantic's core, Polars and many others reach users. Rust took the same path through PyO3 and maturin. Turf, with memory safety by default and no ownership calculus to learn, is a natural language for that core. Today it cannot be one, because nothing outside a Turf program can call Turf.

The pieces exist. C already calls Turf through callbacks (`qsort` in `ffi_and_unsafe.md` §8). The runtime already has `mem::root` for an object C holds. What is missing is a named entry point, a library to put it in, and a runtime that can live inside someone else's process.

## Design

### `@export`

```turf
@export
pub fn crc32(data: Slice<char>): int32 {
    ...
}

@export(name: "png_tool_open")
pub fn open(path: string): !&Image {
    ...
}
```

- `@export` goes on a `pub` free function. The C symbol is `<package>_<name>` by default, since C has one namespace for every library in a process. `@export(name: "...")` chooses it.
- An exported function's parameter and return types must have a C form:

| Turf type | C form | At the boundary |
|---|---|---|
| `int`, `int32`, `double`, `bool`, `char` | `int64_t`, `int32_t`, `double`, `bool`, `char` | Passed as is |
| `string` parameter | `const char *` | Copied into the GC heap on entry; a null is a panic naming the parameter |
| `string` result | `char *` | Copied into `malloc` memory; the caller frees it with `<package>_free_string` |
| `Slice<T>` parameter | `const T *ptr, int64_t len` | A view valid for the call only; storing it is an escape error, like a stack reference (F-MEM-5) |
| `&T` / `&?T` with `T` `@layout(c)` | `T *` | `&T` is checked for null on entry |
| `&T` / `&?T` with any other `T` | `<package>_T *`, an opaque handle | See Handles |
| `fn(...)` with C-form types | a C function pointer | Only a function without captures |
| `!T` result | `int32_t f(..., T *out)` | 0 on success, otherwise the error's ordinal plus one, named in the header |
| `void` | `void` | |

- Any other type in an exported signature is an error naming the parameter and the closest type that has a C form.
- An exported function is an ordinary Turf function too, callable from Turf.

### Handles: Turf objects C can hold

A `&T` that leaves Turf through an exported function, where `T` is not `@layout(c)`, becomes a handle. The runtime roots the object (`mem::root`) as it crosses, so the collector keeps it alive while only C holds it. The header declares an opaque type and a release function:

```c
typedef struct png_tool_Image png_tool_Image;
void png_tool_Image_release(png_tool_Image *image);
```

When a handle comes back in as a parameter, the runtime looks it up in its table of live handles. A released, forged or foreign handle is a panic naming the type ("png_tool_Image used after release"), not a read of freed memory. Turf code never sees the handle, only `&Image`.

### `turf build --lib`

```toml
[lib]
kind = ["static", "shared"]
```

`turf build --lib` (or a `[lib]` table) writes `build/lib<package>.a`, `.so`, `.dylib` or `.dll`, and `build/include/<package>.h`. The header:

- includes `<stdint.h>` and `<stdbool.h>`, and is wrapped in `extern "C"` for C++;
- declares every exported function, `@layout(c)` struct, handle type and error code, each with its Turf doc comment;
- declares `<package>_free_string`, each handle's release function, and `<package>_init`, which the first call runs anyway.

A shared library links against the host's C library dynamically, through the system linker, and never against the bundled musl, because the process that loads it already has its own C library. `libturfrt` ships a position-independent build for this. Its symbols are hidden, so two Turf libraries in one process do not collide.

### The runtime inside someone else's process

- **Start-up.** No `main` runs. The first call to any exported function (or `<package>_init`) runs `turf_rt_init()`. Later calls skip it with one load and compare.
- **The stack.** The collector scans the stack conservatively from the current frame up to a base. In a program the base is recorded once, under `main`. In a library each exported entry records the base when it is the outermost Turf frame, and a nested entry (C calls Turf, which calls C, which calls Turf) keeps the outermost one.
- **One thread.** The thread of the first call owns the runtime. A call from any other thread is a panic: "this Turf library was called from a second thread; Turf libraries are single-threaded until the 3.1 runtime". Glue that can report it more gently, like `turf-python`'s, checks first and raises its own error.
- **Signals.** A program installs a handler that turns a stack overflow into a panic. A library does not, because signal handlers belong to the host. `<package>_install_signal_handlers()` opts in.
- **Panics.** A panic still prints its message and ends the process (FREEZE §6.30, F-PANIC-1). Inside Python that ends the interpreter. Expected failures should be `!T` results, which reach C as error codes and Python as exceptions. The reference says so where it introduces `@export`.
- **Two Turf libraries in one process** each carry their own runtime and heap. A handle from one passed to the other fails the live-handle check.

### Python: `turf-python`

`turf-python` is its own repository and tool, versioned against the compiler's driver interface like `turf-lsp`, so the compiler holds no Python knowledge.

**Python imports Turf.** `turf-python build` turns a Turf library into a CPython extension module and a wheel:

```turf
// src/lib.tr in package `fastsum`
@export
pub fn total(xs: Slice<double>): double { ... }
```

```python
import fastsum
fastsum.total(array.array("d", [1.5, 2.5]))   # 4.0
```

- The glue is generated C against CPython's limited API (abi3), so one wheel serves every supported Python version.
- `int`, `float`, `bool`, `str` and objects with the buffer protocol (`bytes`, `array`, numpy arrays) convert in. A `Slice<T>` parameter takes a buffer without copying.
- A `!T` error becomes a Python exception whose class is named after the Turf error.
- A handle becomes a Python object whose deallocation calls the release function, so Python's reference counting decides when Turf's root goes.
- The thread check raises `RuntimeError` instead of panicking.

Before `turf-python` exists, `ctypes` and `cffi` load the shared library and its header directly.

**Turf calls Python.** A `python` package, in the same repository, wraps libpython's C API using [TDP-2-029](/tdp/2-029/)'s contracts:

```turf
import python as py;

fn main(): int {
    py::start();
    defer py::stop();
    immut math: &py::Object = py::import("math");
    defer math.close();
    immut r: double = math.call("sqrt", py::float(2.0)).as_double();
    printline(r);
    return 0;
}
```

`py::Object.close()` is `@ownership(releases: self)`, so a double close is a compile error. An unclosed object is a leak, since Turf has no finalizers.

### C++ and Rust

- **C++** includes the generated header, which is wrapped in `extern "C"`. `turf build --lib --cpp` also writes `<package>.hpp`: a header-only class per handle type whose destructor calls the release function and which cannot be copied, only moved, plus overloads that return `std::string`.
- **Rust** runs `bindgen` on the header in a `build.rs` and links the static library. A generated `-sys` crate and a safe crate over it, as `turf-python` does for Python, could follow as their own tool.

### Cross-linking: `--target` that links

Today `--target=<triple>` writes an object file and stops, because `libturfrt` exists only for the host. Release archives ship `libturfrt` (and its position-independent build) for every Tier 1 platform, alongside the bundled lld and C runtimes that REL-008 already carries. With those, `turf build --target=<triple>` and `turf build --lib --target=<triple>` produce a program or library you can run on that platform, from any of them. This is roadmap F-20. A platform whose collector cannot yet find pointers in registers (INV-RT-4) stays object-only, with the current diagnostic.

## Constitution check

- **I. Safe by default, unsafe by declaration.** C callers are outside Turf's guarantees, as C always is. The boundary checks keep the Turf side safe against them: null checks on `&T` and `string`, a length that comes with every slice, handles validated against a live table, a second thread refused. A C bug that reaches Turf becomes a named panic, not corruption inside Turf's heap.
- **II. Native performance, with costs you can read.** Every copy at the boundary is in the type table above. A slice parameter is a view, not a copy. The per-call cost is a load and a compare for start-up and one for the thread check.
- **III. The compiler is the authority.** Whether a signature can be exported is the compiler's decision, with stable codes. The header is generated, not hand-maintained.
- **IV. Nothing crosses a boundary implicitly.** Only `@export` functions are visible to C, under names the header lists. Strings, slices and handles cross with stated rules.
- **V. A few general mechanisms, not many special cases.** `@export` is an annotation; handles reuse `mem::root`; Python support is a tool over the C library, not a compiler feature.
- **VI. It works when you install it.** `turf build --lib` needs nothing beyond what a program build needs. Cross-linking removes "install a cross toolchain" for Tier 1 targets.
- **VII. Stability is a promise.** All additive. The exported ABI ships before 3.0 so that a correction to it, if one is needed, can be part of the 3.0 register.
- **VIII. A claim is not true until it is demonstrated.** See Verification.

The Non-Goals hold: no borrow checker; the runtime still exists inside the library, so this is not a no-runtime target; no AI in the compilation path.

## Migration

Nothing breaks.

## Verification

- **C.** A C program links the static and the shared library, calls every row of the type table, and passes under ASan and `TURF_GC_STRESS`: strings and slices round-trip, a `!T` error arrives as its code, a handle survives forced collections while only C holds it, and a released handle passed back panics with its type name.
- **Re-entry.** C calls Turf, which calls a C callback, which calls Turf again. Collections inside the inner call keep the outer call's objects alive.
- **Threads.** A call from a second thread produces the named panic.
- **Python.** `ctypes` on the shared library; then a `turf-python` wheel installed into a clean virtual environment on each Tier 1 platform, its tests run under `python -X dev`, and a handle released by Python's garbage collector.
- **C++ and Rust.** The `.hpp` wrapper in a C++ test (destructor releases, copying does not compile), and a Rust crate using `bindgen` on the header.
- **Cross-linking.** From each Tier 1 host, a program and a shared library for every other Tier 1 target, run on that target in CI.

## Drawbacks

- **A panic ends the host process.** That is harsh inside a Python service. Making panics catchable at the boundary would contradict F-PANIC-1, so the answer is `!T` for expected failures.
- **One thread until 3.1.** A Turf library cannot yet be called from a thread pool.
- **Copies of strings at the boundary.** Small for typical arguments; slices exist for bulk data.
- **Two runtimes in one process** if two Turf libraries are loaded. A shared `libturfrt` would fix it at the cost of a versioning problem, so it waits (Unresolved questions).
- **Release archives grow** by a runtime per target.

## Alternatives

- **Export every `pub` function automatically.** Rejected: Principle IV, and C's single namespace makes the names a choice.
- **Hand C raw pointers to Turf objects.** Rejected: the collector would free an object only C holds, and C could hand back anything.
- **Catch panics at the boundary.** Rejected: it would change F-PANIC-1 for one kind of caller.
- **Python support inside `turfc`.** Rejected: it couples the compiler to CPython's versions. A separate repository keeps it independent.
- **Wait for 3.x.** Possible, since this is additive. It is placed before 3.0 so that the 3.0 register can correct the exported ABI or the library runtime if 2.x experience shows a mistake.

## Unresolved questions

- Whether a process with several Turf libraries should share one `libturfrt` shared library.
- How free-threaded Python (no GIL) interacts with the one-thread rule before 3.1. The proposed answer is that `turf-python` takes a lock around every call into a Turf library.
- Whether `<package>_` as the default symbol prefix is right for a package with a long name.
