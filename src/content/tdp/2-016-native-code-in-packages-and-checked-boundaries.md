---
major: 2
number: 16
title: Native code in packages and checked boundaries
description: Let a package build its own C sources and link system libraries, and let an `extern fn` declare contracts the compiler turns into checks.
status: draft
date: 2026-10-15
authors:
  - Turf Team
---

## Summary

A Turf library should be able to wrap C. Today a binding needs hand-written `unsafe` for every call, and the C code must be built by hand and linked with `--link`. This proposal adds two things. A `[native]` table in `turf.toml` lists C sources to compile with the system C compiler, system libraries to link, and include paths, all pinned by the package's hash. And an `extern fn` can state contracts on its parameters and results (non-null, nullable, array with length, who frees a returned pointer) that the compiler lowers into checks at the call, so many calls need no `unsafe { }` at all.

## Motivation

What exists today is `extern fn`, `unsafe { }`, a per-file `unsafe module;` capability honoured per package, `--link <libname>`, and path and git dependencies. To wrap a small C library, an author must:

- compile the C code outside Turf and tell every user how to link it;
- write an `extern fn` for each function;
- write an `unsafe { }` block at every call, checking by hand that a pointer is not null, that a length matches, and that a returned pointer is freed.

The third part is where mistakes happen, and it is the part the compiler could do. A binding that is mostly the same checks repeated is a binding the compiler should write.

## Design

### The `[native]` table

```toml
[native]
sources  = ["c/png_wrap.c"]
include  = ["c/include"]
libs     = ["png", "z"]
```

The sources are compiled with the system C compiler and linked into everything that depends on the package. System libraries generalise `--link`. The C sources are part of the package's tree hash, so `turf.lock` pins them exactly like Turf source. A package with no `[native]` table never needs a C compiler.

The compiler used is the system's: the `CC` environment variable first, then `cc`, `clang` or `gcc`, and MSVC on Windows. If none is found, the error says so and names how to set one.

### Checked boundary contracts

A binding states, in safe types, what it would otherwise check by hand. The compiler lowers the contract into the checks and conversions at the call.

```turf
extern fn png_open(path: &cstring): &?Png;
extern fn png_read(img: &Png, buf: Slice<byte>): int;
extern fn png_free(img: owned &Png);
```

| Contract | Meaning | What the compiler emits |
|---|---|---|
| `&T` | Never null | A null check before the call; a null is a panic or an error as declared |
| `&?T` | May be null | The result is a nullable reference the caller must handle |
| `Slice<T>` | An array view | Passed as a pointer and a length, with the length taken from the view |
| `owned` | The callee takes or returns ownership | The pairing with its free function is checked in debug mode ([TDP-2-015](/tdp/2-015/), runtime debug checks) |

Because the checks are emitted by the compiler at the call, such a call needs no `unsafe { }`. The part that remains `unsafe` is the declaration itself, which says what the C function is promised to do. The exact spelling is settled under the new-syntax rule: easy to read, and with no way around a check in safe code.

## Constitution check

- **I. Safe by default, unsafe by declaration.** The declaration of an `extern fn` is the unsafe act, and it is where the author states the promise. A call through a contract is checked by the compiler. A contract can only add checks, never remove one.
- **II. Native performance, with costs you can read.** A contract's checks are a null test and a length pass, visible in the declaration. C code is compiled by the system compiler at its own optimisation level.
- **III. The compiler is the authority.** The compiler generates the checks from the declaration and does not trust a call site's claim.
- **IV. Nothing crosses a boundary implicitly.** This proposal is about the boundary. Nullability, length and ownership are written in the signature instead of being assumed.
- **V. A few general mechanisms, not many special cases.** One contract vocabulary applies to every `extern fn`. No library gets a special form.
- **VI. It works when you install it.** A pure-Turf package never needs a C compiler. For a native one, the error names what to install.
- **VII. Stability is a promise.** Both are additive: a package without `[native]` and an `extern fn` without contracts behave as before.
- **VIII. A claim is not true until it is demonstrated.** A test binds a real C library with contracts and shows the checks fire, and the sources' hash is pinned by `turf.lock`.

The Non-Goals hold. This asks for no borrow checker, since contracts are checks at a call and not a tracking of lifetimes. It asks for no no-runtime targets, and no model is involved.

## Migration

Nothing breaks. An existing `extern fn` with its hand-written `unsafe { }` calls compiles as before. An author may add contracts to a binding and then remove the `unsafe { }` blocks the contracts make unnecessary.

## Verification

- A package that builds C sources and links a system library, built on Linux, macOS and Windows.
- A test that the hash in `turf.lock` changes when a C source changes.
- Tests for each contract: a null passed for a `&T` is caught, a length is taken from the view, a nullable result must be handled.
- A test that a binding using contracts needs no `unsafe { }` at the call.
- A test of the error when no C compiler is found.

## Drawbacks

- Building C introduces the platform's compiler and its differences into a package.
- A contract can be wrong: the compiler checks what is declared and cannot know whether C honours it. The checking mode helps, and the declaration stays the author's responsibility.
- More vocabulary in `extern fn` to learn.

## Alternatives

- **Keep binding by hand.** Rejected: it is where mistakes concentrate.
- **Ship prebuilt binaries.** Rejected: a published package is source, built by the consumer's compiler.
- **Generate bindings from C headers.** A useful tool for later. It still needs contracts to say what a header does not.

## Unresolved questions

- The final spelling of `owned` and of the contracts, under the readability rule.
- How a contract is written for a struct passed by value or an out-parameter.
- Whether the build is cached per package, and how that interacts with separate compilation.
- How cross-compilation selects a C compiler.
