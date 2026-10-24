---
major: 2
number: 31
title: Python and Turf
description: "`turf-python`: build a Python extension module and wheel from a Turf library, with type stubs, exceptions for Turf errors and objects for handles; and a `python` package that lets a Turf program call Python."
status: draft
date: 2026-10-25
authors:
  - Turf Team
---

## Summary

`turf-python` is a tool and a Turf package in their own repository. It works in two directions:

- **Python imports Turf.** From a Turf library built by `turf build --lib` ([TDP-2-030](/tdp/2-030/)), `turf-python build` generates a CPython extension module and a wheel. A function marked `@export` becomes a Python function, an error becomes an exception, a handle becomes a Python object, and a buffer such as a numpy array is passed without a copy. `turf-python` is also a PEP 517 build backend, so `pip install .` builds a Turf project the way maturin builds a Rust one.
- **Turf calls Python.** A `python` package wraps the CPython API using [TDP-2-029](/tdp/2-029/)'s contracts, so a Turf program can import a Python module and call it.

The compiler knows nothing about Python. The tool reads only the export description and the built library. It ships after the compiler's 2.9.0, at its own pace.

## Motivation

A fast core imported from Python is how much of Python's speed reaches its users: numpy, Polars and Pydantic's core are written in C, C++ and Rust. Turf can be that core language with memory safety by default and no ownership rules to learn. The reverse direction matters too. Python's libraries for data, science and machine learning are reachable from almost any language that embeds CPython, and a Turf program should be one of them.

## Design

### Python imports Turf

A Turf package:

```turf
// src/lib.tr in package `fastsum`

/// The sum of every element.
@export
pub fn total(xs: Slice<double>): double {
    mut sum: double = 0.0;
    for x in xs { sum += x; }
    return sum;
}

/// Parses `key=value` lines.
@export
pub fn parse(text: string): !&Config error { BadLine } { ... }
```

```toml
# pyproject.toml
[build-system]
requires = ["turf-python>=1.0"]
build-backend = "turf_python.backend"
```

```python
import fastsum, numpy as np

fastsum.total(np.arange(5.0))      # 10.0, the array is not copied
cfg = fastsum.parse("a=1\nb=2")    # a fastsum.Config object
try:
    fastsum.parse("nonsense")
except fastsum.BadLine as e:        # a subclass of fastsum.Error
    print(e)
```

**Conversions**, read from the export description:

| Turf | Python | At the boundary |
|---|---|---|
| `int`, `int32` | `int` | `OverflowError` if it does not fit |
| `double` | `float` | |
| `bool` | `bool` | |
| `char` | `int` 0–255, or a one-byte `bytes` | |
| `string` | `str` (UTF-8) | Copied |
| `Slice<T>` | any object with the buffer protocol and a matching item format (`bytes`, `bytearray`, `array.array`, `memoryview`, numpy arrays) | Not copied; `TypeError` on a format mismatch or a non-contiguous buffer |
| `&T` handle | an instance of a generated class `T` | Released when Python frees the object |
| `!T` error | an exception class per error, under one `Error` base per module | |

**Handles.** A handle becomes an object whose deallocation calls the release function, so Python's reference counting decides when the Turf object can be collected. A class whose Turf type has a method marked `@ownership(releases: self)` also supports `with`, which calls that method on exit, and a call after it raises `ValueError` instead of reaching the library's panic.

**The GIL.** Arguments are converted while the GIL is held. The glue then **releases the GIL** while it waits for the library's entry lock and while the Turf code runs, so other Python threads keep running Python. A Turf callback into Python takes the GIL again. Releasing the GIL while waiting is what keeps the entry lock from deadlocking against it. On free-threaded Python (3.13t and later) there is no GIL, and the entry lock alone serializes calls into Turf.

**Panics.** A Turf panic ends the process, Python included (F-PANIC-1). The generated docs say so, and point library authors to `!T` for every expected failure.

**The build.**
- One wheel per platform, built against CPython's limited API (abi3) so it serves every supported Python version.
- On Linux the wheel is tagged `manylinux` with the glibc baseline of the build machine, and `musllinux` when built against musl. The Turf library links the host's C library dynamically ([TDP-2-030](/tdp/2-030/)).
- A `.pyi` stub file with every function's types and doc comment, so editors and type checkers see the module.

### Turf calls Python

```turf
import python as py;

fn main(): int {
    py::start();
    defer py::stop();

    immut np: &py::Object = py::import("numpy");
    defer np.close();
    immut a: &py::Object = np.call("arange", py::int(5));
    defer a.close();
    printline(a.call("sum").as_int());   // 10
    return 0;
}
```

- `py::Object` is a handle over a `PyObject *` reference, with `close()` marked `@ownership(releases: self)` ([TDP-2-029](/tdp/2-029/)). Closing twice, or using an object after closing it, is a compile error inside a function and a panic through a copy.
- An unclosed object leaks a reference, since Turf has no finalizers. `defer` is the idiom, and AN-5's leak warning sees a missing one.
- A Python exception raised by a call becomes a Turf error value (`py::Error` with the exception's type name and message), never a panic.
- The package holds the GIL from `py::start()` on, since the Turf program has one mutator.
- It links the system's `libpython3`, found through `python3-config`, from the package's `[native] libs`.

## Constitution check

- **I. Safe by default, unsafe by declaration.** The glue and the `python` package hold the `unsafe` code. A Turf or Python user of either writes none. Buffers are checked for format and contiguity before Turf sees them.
- **II. Native performance, with costs you can read.** Buffers are not copied; strings are, as the table says. Turf code runs with the GIL released.
- **III. The compiler is the authority.** Not affected; the compiler only produces the library and its description.
- **IV. Nothing crosses a boundary implicitly.** Only `@export` functions appear in Python. Python objects reach Turf only as handles.
- **V. A few general mechanisms, not many special cases.** The glue is generated from the general export description. The `python` package uses the same contracts as any C binding.
- **VI. It works when you install it.** `pip install` of a wheel needs no Turf toolchain. `pip install .` on a project needs `turf`, which the build backend says when it is missing.
- **VII. Stability is a promise.** All additive. `turf-python` versions itself and states which export-description schema versions it reads.
- **VIII. A claim is not true until it is demonstrated.** See Verification.

The Non-Goals hold: no borrow checker, no no-runtime target, no AI in the compilation path.

## Migration

Nothing breaks.

## Verification

- Wheels for every Tier 1 platform installed into clean virtual environments for the oldest and newest supported CPython, and for a free-threaded build; the test suite run under `python -X dev`.
- Every conversion row, including a numpy array passed without a copy (its memory is written by Turf and read back by numpy), a non-contiguous array rejected, and an integer that overflows.
- A handle released by Python's garbage collector while Turf collections are forced (`TURF_GC_STRESS`); `with` closing it; a call after closing raises.
- Ten Python threads calling one library at once: results correct, Python threads not blocked while Turf code runs, no deadlock with a Turf callback into Python.
- The `python` package: import, call, an exception turned into `py::Error`, and the compile errors for double close.

## Drawbacks

- **A panic ends the interpreter.** The answer is `!T`, but a bug in a library still takes the process down.
- **Serialized Turf calls** until 3.1: Python threads run in parallel with Turf, not with each other inside Turf.
- **Another repository** to release and keep in step with CPython.

## Alternatives

- **Glue written by hand with `ctypes` or `cffi`.** It works from day one and stays possible. It loses types, exceptions and handle lifetimes, which is what this proposal is for.
- **Use PyO3's approach of a library inside the language's compiler.** Rejected: the compiler stays free of any host language.
- **Keep the GIL during Turf calls.** Simpler, but it stops every Python thread while Turf runs.

## Unresolved questions

- Whether `char` maps to `int` or to one-byte `bytes` by default.
- Whether the `python` package should also offer a thin layer for numpy arrays as `Slice<T>` views, which needs the buffer protocol on the Turf side.
