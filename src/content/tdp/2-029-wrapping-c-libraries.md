---
major: 2
number: 29
title: Wrapping C libraries
description: "Make the careful way to use a C library the normal way: ownership and length contracts the compiler checks, `turf bind` to write declarations from a header, safe wrappers as ordinary Turf code, sanitizers on a package's C code in `turf test`, and C++ and Rust libraries through the C ABI."
status: draft
date: 2026-10-25
updated: 2026-10-25
authors:
  - Turf Team
---

## Summary

Python's ecosystem is mostly C. Someone who knows a C library wraps it once, and everyone else imports the wrapper. This proposal gives Turf the same path, built on the boundary that [TDP-2-016](/tdp/2-016/) adds (`[native]` sources and checked `extern fn` types). It has five parts:

- `@ownership` grows from "this allocates" and "this frees" into a small contract language: who owns a result, which argument it borrows from, and where a buffer's length comes from.
- `turf bind` reads a C header and writes the `extern fn` declarations. Where the header does not say who owns something, it asks instead of guessing.
- `turf bind --wrap` writes a safe wrapper module from the contracts, as ordinary Turf source in the package.
- `@ownership(releases: self)` on a Turf method makes closing a handle twice, or using it after closing, a compile error inside a function.
- `turf test --sanitize` builds a package's C sources with AddressSanitizer and UndefinedBehaviorSanitizer.

C++ and Rust libraries come in through the C ABI, the way they reach Python. Everything here is additive. It ships in 2.8.

## Motivation

Today a binding is hand-written `extern fn` lines whose truth the compiler takes on trust ("Getting this wrong is not diagnosed", `ffi_and_unsafe.md` §1). Every call that passes a pointer sits in `unsafe`. Whether a returned pointer must be freed, and by whom, lives in the library's documentation, not in the code.

TDP-2-016 makes the types honest: `&T` is checked for null, `&?T` must be handled, `Slice<T>` carries its length. What it cannot say is the relationships between values: this pointer is valid only while that handle is open, this length belongs to that buffer, this call frees that argument. Those relationships are where most C-binding bugs live.

A language whose ecosystem grows from C needs wrapping a library to be an afternoon's work, and a wrapper's safety to be checked, not hoped for.

## Design

### Contracts: `@ownership` and `@length`

The existing annotation keeps its meaning and gains forms. Each is a fact about the C function, stated on its declaration:

| Contract | Meaning | What the compiler does with it |
|---|---|---|
| `@ownership(acquires)` | The result is a fresh allocation the caller must release (today) | Tracks it for E017 (double free) and E018 (use after free), as today |
| `@ownership(releases: p)` | The call frees what `p` holds (today) | As today |
| `@ownership(borrows: p)` | The result points into `p`'s memory and is valid only while `p` is | A use of the result after `p` is released is E018, through the same per-function check |
| `@ownership(keeps: p)` | The callee stores `p` beyond the call | Passing a reference to a Turf object requires that object to be rooted (`mem::root`) or a `@layout(c)` value in C memory; otherwise an error naming the collector |
| `@length(of: buf, from: n)`, optionally `max: N` | The length of buffer `buf` is the integer `n`; `n` may be an out-parameter | A `Slice<T>` built from the result takes `n` as its length; the wrapper never guesses with `strlen` |

```turf
@ownership(acquires)
extern fn buffer_new(capacity: int): ptr;

@ownership(borrows: buf)
@length(of: return, from: len)
extern fn buffer_data(buf: ptr, len: int*): char*;

@ownership(releases: buf)
extern fn buffer_free(buf: ptr): void;
```

This proposal also settles TDP-2-016's open spelling of ownership. Ownership is stated only with `@ownership`, so TDP-2-016's `owned &Png` is written `@ownership(releases: img)` on `png_free` and `@ownership(acquires)` on whatever returns a `Png`. One mechanism for one idea (Principle V), and no new keyword.

A contract is only as true as the declaration. The compiler checks that code obeys the contract. It cannot check that the C function does. The declaration stays the place where trust is given, which is why writing one needs the raw-pointer capability, as an `extern fn` already does.

**What is checked and what is trusted.** The annotation describes the contract. The compiler and the wrapper enforce only the parts they can actually verify, and the reference lists the rest as trust:

| Checked by the compiler | Checked at run time | Trusted, never checked |
|---|---|---|
| Turf code obeys the contract: no use of a `borrows` result after its owner is released, no second `releases`, no use after a `releases: self` method | A null result where the contract allows none; a negative length; a length above an optional `@length(..., max: N)`; use of a closed handle (the wrapper's `open` flag) | That the pointer really points at `n` readable elements; that a `borrows` result is not kept, or a `keeps` parameter not freed, by the C function; that `acquires` really is a fresh allocation |

`@length` therefore gives a wrapper the length the contract names, after checking that it is not negative and not above `max:`. It cannot give the true length of the C buffer, and a wrong annotation is a wrong wrapper. `max:` is how a binding author bounds the damage of a lying length.

### `turf bind`: declarations from a header

```text
turf bind include/buffer.h --out src/buffer/sys.tr
```

`turf bind` runs the system C compiler (D-26) as `clang -Xclang -ast-dump=json -fsyntax-only` on the header, plus `-dM -E` for numeric `#define` constants, and writes:

- one `extern fn` per function, with the TDP-2-016 types where the C type decides them (`const char *` → `&cstring` parameter, `T *` with a length parameter beside it → `Slice<T>` if a rule in `bind.toml` says so);
- one `@layout(c)` struct per C struct ([TDP-2-027](/tdp/2-027/)), fields in C order;
- each C enum as `pub immut` `int32` constants, and each numeric macro as a `pub immut` constant;
- `bind.toml`, the questions it could not answer.

A C header says a function returns a pointer. It almost never says who frees it, or what a pointer parameter is borrowed from. For every such pointer, `turf bind` writes the declaration with a raw `ptr`, which is `unsafe` to use, and a question in `bind.toml`:

```toml
[buffer_new.return]
ownership = "?"   # acquires | borrows:<param> | static

[buffer_data.return]
ownership = "?"
length = "?"      # from:<param> | nul-terminated | none
```

Answering a question and running `turf bind` again turns the raw pointer into the contract. Running it with no change produces identical output, so the generated file can be checked in and diffed. GCC cannot dump an AST, so `turf bind` needs Clang. If it is not found, the error says so and names how to install it.

### `turf bind --wrap`: a safe module from the contracts

From a declaration file whose questions are answered, `turf bind --wrap` writes a second module of ordinary Turf code that a reviewer can read:

```turf
pub struct Buffer { raw: ptr, open: bool }

pub fn Buffer.new(capacity: int): &Buffer {
    unsafe {
        return heap(Buffer { raw: sys::buffer_new(capacity), open: true });
    }
}

@ownership(releases: self)
pub fn Buffer.close(): void {
    if !self.open { panic("Buffer used after close"); }
    unsafe { sys::buffer_free(self.raw); }
    self.open = false;
}

pub fn Buffer.data(): char[] {
    if !self.open { panic("Buffer used after close"); }
    unsafe {
        mut n: int = 0;
        immut p: char* = sys::buffer_data(self.raw, &n);
        return mem::copy_to_array(p, n);   // a GC copy, with the length the contract names
    }
}
```

The rules the generator follows:

- **An opaque handle.** The C pointer is a private field of a GC object reached through `&Buffer`, so every copy of the handle sees one `open` flag.
- **Copy-in, copy-out.** Data a borrowed pointer reaches is copied into Turf memory with the contract's length. No Turf value points into C memory after the wrapper returns.
- **A named panic, not a corrupted heap.** A use after close is a panic with the type's name, whatever path reached it.
- **No finalizers** (FREEZE §6.5). An unclosed handle leaks its C memory, as an unreleased `mem::alloc` does today, and AN-5's leak warning sees it. `defer b.close();` is the idiom.

The wrapper is source, not a compiler feature, so it costs exactly what it says (Principle II), and a package author can edit it. The `pub` API it produces holds no raw pointer, so LB-4 is satisfied by construction.

### `@ownership(releases: self)`: use-once methods

`@ownership` is accepted on an instance method with `releases: self` (today E146). Inside one function, after a call to such a method on a variable:

- a second call is E017 ("Double close detected for 'b'"),
- any other method call or field read through that variable is E018,
- a release on only some paths is the existing "may already have been released" warning.

This is the check that finds a double `free` today, generalized from raw pointers to any type that declares a releasing method. It is per function and needs no annotation from the caller, so it is not a borrow checker. It does not follow a handle through a copy stored somewhere else. The runtime `open` flag catches that.

### `turf test --sanitize`

`turf test --sanitize=address,undefined` compiles the package's `[native]` sources, and every dependency's, with `-fsanitize=address,undefined -fno-omit-frame-pointer`, and links the Turf program with the sanitizer runtime and an ASan build of `libturfrt`. A bug in C code on a tested path becomes a named report with a C stack trace. The release archive gains `libturfrt_asan.a`, which F-REL-1 leaves out today, so this is a change to the release layout (FREEZE §6.26) recorded with this item.

### C++ and Rust libraries

Python reaches C++ and Rust through the C ABI, and so does Turf.

- **Rust.** A crate that exposes `extern "C"` functions, usually with a `cbindgen` header, is a C library. `turf bind` reads the header. `[native] libs` links the static or shared library cargo built. Building the crate is cargo's job, not `turf`'s.
- **C++.** `[native] sources` accepts `.cpp` files, compiled with the system C++ compiler (`CXX`, then `c++`, `clang++`, `g++`), and the link adds the C++ standard library. A C++ library is used through a shim of `extern "C"` functions in such a file. The shim catches every exception (a C++ exception unwinding into Turf frames is undefined behaviour) and turns it into an error code. A class becomes an opaque handle with a releasing function, which is exactly the shape `--wrap` produces.
- **What is not proposed.** Calling C++ directly (templates, overloads, classes, destructors) needs a C++ compiler inside `turfc`, as Swift embeds Clang. That contradicts the pure compiler ([TDP-2-019](/tdp/2-019/)) and ties every Turf release to a Clang version. A bridge like Rust's `cxx` crate, where both sides are generated from one declaration of the boundary, could come in 3.x as a separate tool.

## Constitution check

- **I. Safe by default, unsafe by declaration.** The trust stays where it is today, in the `extern fn` declaration, which needs the raw-pointer capability. What changes is how much a safe caller can rely on: contracts become checks, and a generated wrapper's `pub` API has no raw pointer. The proposal never says Turf makes C safe. It says the rules are written down and checked, and every rule that cannot be checked stays visible as a trust someone chose.
- **II. Native performance, with costs you can read.** A wrapper is Turf source that shows every copy and check. Contracts compile to the checks the long-hand code would write. Sanitizers run only under `turf test --sanitize`.
- **III. The compiler is the authority.** `turf bind` is deterministic and never guesses ownership. Contract violations are compiler errors with stable codes.
- **IV. Nothing crosses a boundary implicitly.** Ownership, borrowing and lengths at the C boundary are written on the declaration where a reader looks. Today they are written nowhere.
- **V. A few general mechanisms, not many special cases.** `@ownership` grows, rather than a new keyword appearing beside it; `owned` is folded into it; the use-once check is the existing double-free check, open to any user type. The standard library uses the same annotations.
- **VI. It works when you install it.** `turf bind` and `--sanitize` ship in `turf`. `turf bind` needs Clang and says so plainly when it is missing.
- **VII. Stability is a promise.** All additive. Code that compiles today compiles unchanged; `@ownership` on a method is E146 today.
- **VIII. A claim is not true until it is demonstrated.** See Verification. The blog's table of what each part promises is the claim, and nothing more is claimed.

The Non-Goals hold. The use-once check is per function, follows no reference through the heap, and asks callers for no annotation, so it is not a borrow checker. No no-runtime target, no AI in the compilation path.

## Migration

Nothing breaks. TDP-2-016's `owned` spelling never shipped, so folding it into `@ownership` changes nothing in the field.

## Verification

- **Contracts.** For each new form, a failing test per violation (borrowed result used after release, `keeps:` on an unrooted object) and a passing test on the nearest correct program; the existing E017/E018 tests unchanged.
- **`turf bind`.** Run on the headers of zlib, SQLite, libpng and a `cbindgen` header from a Rust crate: the output compiles; every pointer whose ownership the header does not state is a `bind.toml` question; a second run is byte-identical.
- **Wrappers.** A generated zlib wrapper passes a round-trip test under `TURF_GC_STRESS` and ASan. A test closes a handle, uses it through a copy, and gets the named panic.
- **Use-once.** Double close and use after close inside one function are compile errors on every path shape the E017/E018 tests cover.
- **Sanitizers.** A package with a deliberate C heap overflow fails `turf test --sanitize=address` with an ASan report and passes without it.
- **C++.** A `.cpp` shim over a small C++ class, including one method that throws, works end to end; the exception becomes an error code.

## Drawbacks

- **A contract can lie.** If a declaration says `borrows` and the C function keeps the pointer, the wrapper is wrong and nothing can know. The reference says this in the section that introduces contracts.
- **`turf bind` depends on Clang**, not just any C compiler.
- **Wrappers copy.** Copy-out is the safe default and costs time on large buffers. A wrapper author can hand-write a view over C memory in an `unsafe` module when that cost matters.
- **The release archive grows** by an ASan runtime.

## Alternatives

- **The compiler generates wrappers itself**, invisibly, from contracts. Rejected: hidden code makes costs unreadable and wrappers uneditable. Generated source is reviewable.
- **A separate `owned` keyword**, as TDP-2-016 sketched. Rejected in favour of one mechanism.
- **`turf bind` guesses ownership** from names (`*_new`, `*_free`). Rejected: Principle V forbids facts from names, and a wrong guess is a memory bug with a safe-looking API.
- **Direct C++ interop through an embedded Clang.** Rejected for now (see above).
- **Do nothing.** Bindings stay hand-written and trusted.

## Unresolved questions

- `@length(of: return, ...)`: whether `return` is the right word for the result, or `@length` goes on the return type.
- Whether `turf bind` also reads a header-adjacent annotation file that library authors could ship upstream, so every Turf user of a library shares one set of answers.
- The exact name of the copy helper (`mem::copy_to_array` above is a placeholder).
