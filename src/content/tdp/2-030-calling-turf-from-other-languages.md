---
major: 2
number: 30
title: Calling Turf from other languages
description: "Build a Turf package as a C library: `@export` functions, `turf build --lib` with a generated header and a JSON export description, a runtime that starts on first call, handles C can hold safely, which languages can call it safely, and cross-linking with per-target runtimes."
status: draft
date: 2026-10-25
updated: 2026-10-25
authors:
  - Turf Team
---

## Summary

Today C can call Turf only through a callback that Turf handed it first, and only from inside a Turf program. This proposal lets a Turf package be built as a static or shared library that any language with a C FFI can load:

- `@export` on a function gives it a C symbol and a C signature.
- `turf build --lib` writes the library, a C header, and a JSON description of the exports that glue generators read instead of parsing C.
- The runtime starts itself on the first call and scans the right stack. Any thread may call, one at a time: a lock lets one thread into the library while the others wait, so the runtime keeps a single mutator until the thread-aware runtime (3.1) lets them run in parallel.
- A Turf object handed to C becomes a handle the collector keeps alive until C releases it. A released, forged or foreign handle coming back is refused with an error the caller can handle, never a read of freed memory and never an end to the host process.
- C, C++, Rust, Zig, Swift and every other language with a C FFI call Turf through the same header. What each of them needs is stated per language.
- Languages that deserve richer glue get their own proposals, each in its own repository: Python ([TDP-2-031](/tdp/2-031/)), Node.js ([TDP-2-032](/tdp/2-032/)) and Lua ([TDP-2-033](/tdp/2-033/)). Calls in parallel from many threads, which the JVM, .NET, Go and the BEAM want for speed, wait for [TDP-3-003](/tdp/3-003/).
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
- `@export` also goes on a `pub` method of a type that crosses as a handle. Its C symbol is `<package>_<Type>_<name>` and its first parameter is the handle. Glue generators turn these into methods of the generated class.
- An exported function's parameter and return types must have a C form:

| Turf type | C form | At the boundary |
|---|---|---|
| `int`, `int32`, `double`, `bool`, `char` | `int64_t`, `int32_t`, `double`, `bool`, `char` | Passed as is |
| `string` parameter | `const char *` | Copied into the GC heap on entry; a null is `TURF_E_NULL` |
| `string` result | `char *` | Copied into `malloc` memory; the caller frees it with `<package>_free_string` |
| `Slice<T>` parameter | `const T *ptr, int64_t len` | A view valid for the call only; storing it is an escape error, like a stack reference (F-MEM-5). A negative length, or a null pointer with a length above zero, is `TURF_E_BAD_LENGTH` |
| `&T` / `&?T` with `T` `@layout(c)` | `T *` | `&T` is checked for null on entry (`TURF_E_NULL`) |
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

When a handle comes back in as a parameter, the runtime looks it up in its table of live handles. A released, forged or foreign handle is refused with `TURF_E_DEAD_HANDLE`, and one of another type with `TURF_E_WRONG_HANDLE` (see Boundary errors). No memory is read through it. Turf code never sees the handle, only `&Image`. A release function returns a status too, so releasing a handle twice is `TURF_E_DEAD_HANDLE`, not a crash.

### Boundary errors

A failure at the boundary has one of two causes, and they are treated differently.

**The caller made a mistake.** A dead, forged, foreign or wrongly typed handle; a null where a value is required; a negative length or a null buffer with a length. None of these is a bug in the Turf library, so none ends the host process. They are error results:

- Every exported function that takes a handle, a non-null `&T`, a `string` or a `Slice` uses the status form `int32_t f(..., T *out)`, whether or not its Turf signature is `!T`. Functions that take only scalars keep their direct return, since nothing about their arguments can be invalid.
- The status codes for caller mistakes are fixed and the same in every library: `TURF_E_NULL`, `TURF_E_BAD_LENGTH`, `TURF_E_DEAD_HANDLE`, `TURF_E_WRONG_HANDLE`. They are negative. A function's own errors (`!T`) are its error's ordinal plus one, so the two never collide. The header defines both, and `<package>_status_message(int32_t)` gives the text.
- The checks run before any Turf code, so a refused call has no effect.
- Glue turns caller errors into the host's own errors: `ValueError` and `TypeError` in Python, `TypeError` in JavaScript, a Lua error.
- A returned status, rather than a thread-local "last error" in the style of `errno`, is used because it is hard to ignore and needs no thread-local state.

**The library has a bug.** A failed bounds or overflow check, a `panic(...)`, a broken invariant inside Turf code. That is a panic, and a panic ends the process (FREEZE §6.30, F-PANIC-1), as in a program. The distinction is the one the reference draws for every Turf API: errors for what a caller can get wrong, panics for what the library got wrong.

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

### The export description

A C header is written for a C compiler. It loses what a generator of Python, JavaScript or Lua glue needs to know: that a pointer and a length are one slice, that a pointer is a handle and which function releases it, which integer codes an error set uses and their names, and the doc comments. `turf build --lib` therefore also writes `build/include/<package>.json`:

```json
{
  "schema": "1.0",
  "package": "png_tool",
  "version": "0.3.0",
  "runtime_abi": "2.9",
  "functions": [
    {
      "name": "open",
      "symbol": "png_tool_open",
      "doc": "Opens a PNG file.",
      "params": [
        { "name": "path", "type": "string", "c": "const char *", "nullable": false }
      ],
      "returns": { "type": "!&Image", "c": "int32_t", "out": "png_tool_Image **", "handle": "Image", "errors": "OpenError" }
    }
  ],
  "handles": [
    { "name": "Image", "c": "png_tool_Image", "release": "png_tool_Image_release" }
  ],
  "errors": [
    { "name": "OpenError", "codes": { "NotFound": 1, "BadFormat": 2 } }
  ],
  "structs": [],
  "helpers": { "free_string": "png_tool_free_string", "init": "png_tool_init" }
}
```

- The schema is versioned like the diagnostics and package-graph schemas (IF-2): `docs/reference/schemas/exports.schema.json`, where a minor version adds fields and a major version changes or removes one.
- `@layout(c)` structs are listed with each field's offset and size, so a generator does not recompute C's layout rules.
- Each `Slice` parameter records whether the function can write through it. The compiler decides this conservatively: a write to an element, or passing the slice to any other function, counts as a write. Glue uses it to accept read-only host buffers for slices that are only read.
- `@export(snapshot)` and `@export(copy_mismatched)` are recorded per function. They are instructions to glue: copy slices before the call, or copy a host buffer whose layout does not match instead of refusing it.
- The header and the description are written from the same table in the compiler, so they cannot disagree. A test compares them.
- Glue generators (`turf-python`, `turf-node`, `turf-lua`) read only this file and the built library. They need no compiler headers and no `libturf`, so each repository moves at its own pace (Part 4.3 of the roadmap).

### The runtime inside someone else's process

- **Start-up.** No `main` runs. The first call to any exported function (or `<package>_init`) runs `turf_rt_init()`. Later calls skip it with one load and compare.
- **The stack.** The collector scans the stack conservatively from the current frame up to a base. In a program the base is recorded once, under `main`. In a library each exported entry records the base when it is the outermost Turf frame, and a nested entry (C calls Turf, which calls C, which calls Turf) keeps the outermost one.
- **One thread at a time.** Each library has an entry lock. An outermost entry takes it; a nested entry on the same thread (C calls Turf, which calls C, which calls Turf) already holds it. A thread that finds it taken waits. This is sound because the collector only ever needs the stacks of threads that are *inside* Turf, and the lock makes that one thread: a waiting thread holds no Turf pointer except handles, and handles are rooted. FREEZE §6.5's single-threaded mutator is kept; it is simply not always the same OS thread. Calls in parallel need the thread-aware runtime (3.1) and [TDP-3-003](/tdp/3-003/).
- **Deadlock at the boundary.** If Turf calls back into the host while another host thread waits for the entry lock, and the callback waits for that thread, the two deadlock. The rule is stated in the reference: a callback from Turf must not wait for another thread that may call Turf. Glue that holds its own lock (Python's GIL) releases it while waiting for the entry lock, so the common case cannot deadlock.
- `<package>_set_entry_mode(PANIC_ON_CONTENTION)` turns waiting into a named panic, for a host that wants to know it is calling from two threads at once. Glue that can report it more gently, like `turf-python`'s, checks first and raises its own error.
- **Signals.** A program installs a handler that turns a stack overflow into a panic. A library does not, because signal handlers belong to the host. `<package>_install_signal_handlers()` opts in.
- **Panics.** A panic still prints its message and ends the process (FREEZE §6.30, F-PANIC-1). Inside Python that ends the interpreter, so a panic is reserved for a bug in the library (Boundary errors). Caller mistakes are status codes, and expected failures are `!T` results, which reach C as error codes and Python as exceptions. The reference says so where it introduces `@export`.
- **Two Turf libraries in one process** each carry their own runtime and heap. A handle from one passed to the other is `TURF_E_WRONG_HANDLE`.

### Python, Node.js and Lua

These three get glue richer than a header, each in its own proposal and repository, built from the export description:

- **Python** ([TDP-2-031](/tdp/2-031/), `turf-python`): extension modules and wheels, and a `python` package for calling Python from Turf.
- **Node.js** ([TDP-2-032](/tdp/2-032/), `turf-node`): Node-API addons, npm packages with prebuilt binaries, and TypeScript declarations.
- **Lua** ([TDP-2-033](/tdp/2-033/), `turf-lua`): Lua modules written in Turf, and a `lua` package that embeds Lua in a Turf program for scripting.

Before any of them exists, Python's `ctypes` and `cffi`, Node's FFI packages, and LuaJIT's `ffi` load the shared library and its header directly.

### C++ and Rust

- **C++** includes the generated header, which is wrapped in `extern "C"`. `turf build --lib --cpp` also writes `<package>.hpp`: a header-only class per handle type whose destructor calls the release function and which cannot be copied, only moved, plus overloads that return `std::string`.
- **Rust** runs `bindgen` on the header in a `build.rs` and links the static library. A generated `-sys` crate and a safe crate over it, as `turf-python` does for Python, could follow as their own tool.

### Which languages can call Turf safely

Turf's side of the boundary is protected whoever calls it: handles are checked against a live table, `&T` and `string` parameters are checked for null, every such mistake is an error result rather than a panic, and threads enter one at a time. Whether a host language is *safe to use* depends on four questions:

1. Does it have a C FFI that loads a shared library?
2. Do its calls tolerate being **serialized**? Before the 3.1 runtime, two threads never run Turf code at the same moment.
3. Can it guarantee that no exception or `longjmp` unwinds through Turf frames?
4. Does it have a hook (a finalizer, destructor or close) that can release a handle?

| Language | How it calls Turf | Before 3.1 | Glue |
|---|---|---|---|
| C, C++ | The header (`.hpp` with `--cpp`) | Yes | The header |
| Rust | `bindgen` on the header | Yes | The header |
| Zig, Odin, Nim, D | `@cImport`, foreign imports, `c2nim`, `importC` | Yes | The header |
| Swift | A module map over the header | Yes | The header; Swift classes release handles on deinit |
| Python | Extension module | Yes; the glue releases the GIL while it waits for the entry lock | [TDP-2-031](/tdp/2-031/) |
| Node.js | Node-API addon | Yes; worker threads wait their turn | [TDP-2-032](/tdp/2-032/) |
| Lua | C API | Yes | [TDP-2-033](/tdp/2-033/) |
| Ruby | `ffi` gem or C extension | Yes | The header |
| R, Julia, PHP | `.Call`, `ccall`, `FFI` | Yes | The header |
| Java, Kotlin (JVM) | Panama FFM, `jextract` on the header | Yes, serialized; in parallel from 3.x | The header; [TDP-3-003](/tdp/3-003/) |
| C#, F# (.NET) | `LibraryImport` / P/Invoke | Yes, serialized; in parallel from 3.x | The header; [TDP-3-003](/tdp/3-003/) |
| Go | cgo | Yes, serialized (a goroutine stays on its thread for the length of a cgo call); in parallel from 3.x | The header; [TDP-3-003](/tdp/3-003/) |
| Erlang, Elixir | NIFs | Only as dirty NIFs: a scheduler waiting on the entry lock stalls the VM | [TDP-3-003](/tdp/3-003/) |
| WebAssembly | — | No | Not interop but a compile target: the collector cannot scan a WebAssembly stack. It needs its own proposal. |

"Serialized" costs throughput, never safety: a thread pool calling a Turf library runs its Turf calls one after another.

### Cross-linking: `--target` that links

Today `--target=<triple>` writes an object file and stops, because `libturfrt` exists only for the host. Release archives ship `libturfrt` (and its position-independent build) for every Tier 1 platform, alongside the bundled lld and C runtimes that REL-008 already carries. With those, `turf build --target=<triple>` and `turf build --lib --target=<triple>` produce a program or library you can run on that platform, from any of them. This is roadmap F-20. A platform whose collector cannot yet find pointers in registers (INV-RT-4) stays object-only, with the current diagnostic.

## Constitution check

- **I. Safe by default, unsafe by declaration.** C callers are outside Turf's guarantees, as C always is. The boundary checks keep the Turf side safe against them: null checks on `&T` and `string`, a length that comes with every slice, handles validated against a live table, one thread inside at a time. A caller's mistake becomes an error result, and a bug inside the library a panic; neither becomes corruption inside Turf's heap.
- **II. Native performance, with costs you can read.** Every copy at the boundary is in the type table above. A slice parameter is a view, not a copy. The per-call cost is a load and a compare for start-up and an uncontended lock, which the header documents.
- **III. The compiler is the authority.** Whether a signature can be exported is the compiler's decision, with stable codes. The header is generated, not hand-maintained.
- **IV. Nothing crosses a boundary implicitly.** Only `@export` functions are visible to C, under names the header lists. Strings, slices and handles cross with stated rules.
- **V. A few general mechanisms, not many special cases.** `@export` is an annotation; handles reuse `mem::root`; language glue is tools over the export description, not compiler features.
- **VI. It works when you install it.** `turf build --lib` needs nothing beyond what a program build needs. Cross-linking removes "install a cross toolchain" for Tier 1 targets.
- **VII. Stability is a promise.** All additive. The exported ABI ships before 3.0 so that a correction to it, if one is needed, can be part of the 3.0 register.
- **VIII. A claim is not true until it is demonstrated.** See Verification.

The Non-Goals hold: no borrow checker; the runtime still exists inside the library, so this is not a no-runtime target; no AI in the compilation path.

## Migration

Nothing breaks.

## Verification

- **C.** A C program links the static and the shared library, calls every row of the type table, and passes under ASan and `TURF_GC_STRESS`: strings and slices round-trip, a `!T` error arrives as its code, a handle survives forced collections while only C holds it, and a released, forged or wrongly typed handle passed back returns its status code with no other effect.
- **Boundary errors.** Every caller-error code from every row that can produce one, from C, Python and JavaScript, with the host process still running afterwards; a deliberate bounds failure inside the library still panics.
- **Re-entry.** C calls Turf, which calls a C callback, which calls Turf again. Collections inside the inner call keep the outer call's objects alive.
- **Threads.** Many threads calling at once, under `TURF_GC_STRESS`, never have two inside Turf, and every object survives; a callback that re-enters on the same thread does not deadlock; `PANIC_ON_CONTENTION` panics with its name.
- **The export description.** It validates against its schema and agrees with the header for every test library; `ctypes` loads a library using only names read from it.
- **Other languages.** Each language in the table marked "Yes" has a smoke test in CI that calls one function of each kind and releases a handle; the ones with their own proposal are verified there.
- **C++ and Rust.** The `.hpp` wrapper in a C++ test (destructor releases, copying does not compile), and a Rust crate using `bindgen` on the header.
- **Cross-linking.** From each Tier 1 host, a program and a shared library for every other Tier 1 target, run on that target in CI.

## Drawbacks

- **A panic still ends the host process.** Caller mistakes no longer do, but a bug inside a library does. Making panics catchable would contradict F-PANIC-1 (see Unresolved questions).
- **A status return on more functions.** Any function that takes a handle, reference, string or slice returns a status, which is less convenient from C. Glue hides it in every other language.
- **Serialized until 3.1.** A thread pool can call a Turf library, but its Turf calls do not run in parallel.
- **Copies of strings at the boundary.** Small for typical arguments; slices exist for bulk data.
- **Two runtimes in one process** if two Turf libraries are loaded. A shared `libturfrt` would fix it at the cost of a versioning problem, so it waits (Unresolved questions).
- **Release archives grow** by a runtime per target.

## Alternatives

- **Export every `pub` function automatically.** Rejected: Principle IV, and C's single namespace makes the names a choice.
- **Hand C raw pointers to Turf objects.** Rejected: the collector would free an object only C holds, and C could hand back anything.
- **Catch panics at the boundary.** Rejected: it would change F-PANIC-1 for one kind of caller.
- **Language support inside `turfc`.** Rejected: it couples the compiler to other languages' versions. Separate repositories, reading the export description, keep each independent.
- **Glue generators parse the C header.** Rejected: the header has lost slices, handles and error names by then, and every generator would rewrite a C parser.
- **Wait for 3.x.** Possible, since this is additive. It is placed before 3.0 so that the 3.0 register can correct the exported ABI or the library runtime if 2.x experience shows a mistake.

## Unresolved questions

- Whether a process with several Turf libraries should share one `libturfrt` shared library.
- Whether `<package>_` as the default symbol prefix is right for a package with a long name.
- **Poisoning instead of ending the process.** An opt-in library mode where a panic returns a fatal status to the host, and every later call into that library fails immediately without running Turf code. Memory after the panic is then never observed, which may fit F-PANIC-2, but locks and C memory the library held are leaked, and it changes how F-PANIC-1 reads for libraries. If wanted, it is its own proposal and a recorded amendment.
