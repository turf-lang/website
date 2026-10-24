---
title: A common playground
description: How Turf plans to work with other languages. Use C, C++ and Rust libraries safely from Turf, write a library once in Turf and use it from Python, Node.js, Lua, Rust and more, and run other languages' code inside a Turf program. Plus an open invitation to bug hunters from every language.
date: 2026-10-25
author: Aayush Shukla
github: a2ys
---

At the end of our [last post](/blog/what-after-now/) we shared a few things we would love Turf to do one day, and said none of them had a proposal yet. One of them was about C: making it safer to use, not only safer to contain.

That idea grew. It now has six proposals behind it, and it is no longer only about C. This post is about how we want Turf to work with every other language, why we think that matters more than almost anything else on the road, and why we would love people who break things for a living to come and try.

As before, everything here is a plan, and every example is a design that does not compile yet. The proposals are public, and they are the place to tell us what is wrong.

## What Python taught us

Python is not fast, and most of its most-used libraries are not written in Python. numpy is mostly C. The cryptography library is partly Rust. sqlite3 is C. What Python did was make it easy for someone who knows a C library to wrap it **once**, and then for millions of people to `import` it without ever thinking about C.

That one idea, wrap once and import everywhere, is a large part of why Python is everywhere. It works in both directions. Python calls C, and C programs embed Python to run scripts.

We want Turf to work the same way, with one difference that we think matters: **the safety comes along.** Turf code cannot corrupt memory, so what crosses into Turf is held to Turf's rules, and what Turf hands to another language arrives with its rules already checked.

## Three directions

Here is the whole picture in one place.

```
             Turf uses their libraries
   ┌──────────────────────────────────────────┐
   │                                          ▼
 Turf                                  C · C++ · Rust
   ▲                                          │
   │        they use Turf libraries           │
   └──── C · C++ · Rust · Python · Node.js · Lua · Ruby · Swift · Zig · …

             Turf runs their code inside
   Turf program  ──▶  embedded Python, sandboxed Lua
```

Every arrow goes through the C ABI, the common calling convention that nearly every language already speaks. Turf does not need a separate bridge for each language. It needs one boundary that is very careful, and then small, generated layers on top of it.

## Direction one: Turf uses their libraries

This is about using C, C++ and Rust libraries from Turf ([TDP-2-029](/tdp/2-029/)).

Today you can call a C function from Turf, but the compiler trusts whatever you write about it, and every call that passes a pointer sits inside `unsafe`. The plan changes the normal way of doing it, in three steps.

**A tool reads the header for you.** `turf bind` reads a C header and writes the Turf declarations. Then it does something we care about a lot: where the header does not say who owns a pointer, it **asks** instead of guessing.

```toml
# bind.toml, written by turf bind
[buffer_new.return]
ownership = "?"   # acquires | borrows:<param> | static
```

A header says that a function returns a pointer. It almost never says who has to free it. Guessing from a name like `buffer_free` is how bindings end up with use-after-free bugs behind a friendly API, so the tool never guesses.

**You write the rules down, and the compiler checks them.** The answers become annotations on the declaration:

```turf
@ownership(acquires)
extern fn buffer_new(capacity: int): ptr;

@ownership(borrows: buf)
@length(of: return, from: len)
extern fn buffer_data(buf: ptr, len: int*): char*;

@ownership(releases: buf)
extern fn buffer_free(buf: ptr): void;
```

"This result borrows from `buf`" means that using it after `buf` is freed is a compile error inside the function. "This length comes from `len`" means the data is copied with its real length, never with a guess.

**The safe wrapper is written for you, as plain Turf.** `turf bind --wrap` turns the rules into a module of ordinary Turf code that you can read, review and change. The C pointer is hidden inside a handle. Using a handle after closing it is a panic with the type's name, not a corrupted heap. Closing it twice in the same function does not compile.

```turf
import buffer;

fn main(): int {
    immut b: &buffer::Buffer = buffer::Buffer::new(1024);
    defer b.close();
    printline(b.data().length());
    return 0;
}
```

There is no `unsafe` in that program. The `unsafe` lives in one package, written once, where `turf audit` counts it.

**C++ and Rust come in the same way Python takes them.** A Rust crate with a C API is a C library to Turf. C++ goes through a small file of `extern "C"` functions that catches every exception before it can reach Turf. We are not planning to call C++ templates and classes directly, because that would mean putting a C++ compiler inside Turf's compiler, and we want the compiler to stay only a compiler.

`turf test --sanitize` builds a package's C code with AddressSanitizer and UndefinedBehaviorSanitizer, so a bug in the C part shows up as a named report while you test, not as a crash after you ship.

## Direction two: they use Turf

This is the direction we are most excited about ([TDP-2-030](/tdp/2-030/)).

Write a library in Turf, mark the functions you want to share, and build it as an ordinary C library:

```turf
/// The sum of every element.
@export
pub fn total(xs: Slice<double>): double {
    mut sum: double = 0.0;
    for x in xs { sum += x; }
    return sum;
}
```

```text
turf build --lib
```

You get a static library, a shared library, a C header, and a small JSON file that describes every exported function in more detail than a C header can. The JSON file is what makes the next part possible.

**From Python** ([TDP-2-031](/tdp/2-031/)), a tool builds a real Python package, installable with `pip`:

```python
import fastsum, numpy as np

fastsum.total(np.arange(5.0))   # 10.0, and the array is not copied
```

Turf errors arrive as Python exceptions. A Turf object becomes a Python object that is cleaned up when Python is done with it. Turf code runs without holding Python's global lock, so your other Python threads keep going.

**From Node.js** ([TDP-2-032](/tdp/2-032/)), the same library becomes an npm package with a prebuilt binary for each platform, so `npm install` needs no compiler, plus TypeScript types:

```ts
import { total } from "fastsum";
total(new Float64Array([1.5, 2.5]));   // 4
```

**From Lua** ([TDP-2-033](/tdp/2-033/)), it becomes a module you `require`.

**From C, C++, Rust, Zig, Swift, Ruby, Julia and others**, the header is enough, because each of them already has a tool that reads C headers. C++ gets a generated class for each Turf object, which cleans it up when it goes out of scope.

The idea is simple. **Write the careful part once, in a language that checks it, and use it from wherever your project already lives.** A parser, a codec, a validator or a piece of numeric code, written in Turf, can serve a Python data team, a Node.js backend and a Rust service at the same time, from one source.

## Direction three: Turf runs their code inside

The other way around, a Turf program can host another language.

**Python, from Turf.** A `python` package lets a Turf program import a Python module and call it. That puts Python's libraries for data, science and machine learning within reach of a Turf program:

```turf
import python as py;

fn main(): int {
    py::start();
    defer py::stop();
    immut np: &py::Object = py::import("numpy");
    defer np.close();
    printline(np.call("arange", py::int(5)).call("sum").as_int());   // 10
    return 0;
}
```

A Python exception becomes a Turf error value, never a crash.

**Lua, sandboxed.** A `lua` package builds Lua into your program and gives you a Lua that, by default, **cannot touch the file system, the operating system, or load other code**. You can also cap how much memory a script may use and how many instructions it may run. That makes it a safe way to add configuration, scripting or plugins to a Turf program, with scripts written by people you do not fully trust:

```turf
immut L: &lua::State = lua::State::new();   // sandboxed
defer L.close();
L.set_memory_limit(16 * 1024 * 1024);
L.set_instruction_limit(10_000_000);
L.register("log", log_line);
L.run(user_script) recover run { printline("script failed"); };
```

We want to be precise about what this means. Turf does not make Python's own C code safe, and it does not change what a Python library does. What Turf guarantees is its own side: nothing from the other language reaches Turf code except through a boundary that checks it. For Lua, the sandbox goes further, because it controls what the script can reach at all.

## What "safe" means at the boundary

When people hear "memory safe" and "C" in the same sentence, they rightly get suspicious. So here is the honest version.

Turf **cannot** make another language's code memory-safe. If a C library has a bug, it still has the bug. If a Python extension written in C crashes, Turf cannot stop it.

What Turf **can** promise is that its own side holds, whoever is calling:

- **A Turf object handed out is a handle, never a raw pointer.** Turf keeps it alive while the other language holds it. If a released or forged handle comes back, it is caught with a panic that names the type, before any memory is touched.
- **Every value coming in is checked at the door.** Null pointers are refused, buffers come with their length, and strings are copied into Turf's memory.
- **One thread at a time.** Until Turf's runtime supports threads, a lock lets one thread into a Turf library at a time. Any thread can call, and the calls simply take turns. Later, in 3.3, libraries can opt into calls running truly in parallel ([TDP-3-003](/tdp/3-003/)), which is what Java, C#, Go and Erlang will want.
- **Errors are values.** A Turf function that can fail gives the caller an error it can handle: an exception in Python and JavaScript, an error code in C.

One sharp edge remains, and we would rather you hear it from us. **A Turf panic ends the process**, and that includes a Python interpreter or a Node.js server that loaded the library. Turf panics cannot be caught, by design. The answer is that a library should return errors for everything it expects to go wrong, and keep panics for real bugs.

## Which languages, and when

| Language | Calls Turf | Turf calls it |
|---|---|---|
| C | Yes | Yes |
| C++ | Yes, with a generated class per Turf object | Through `extern "C"` functions |
| Rust | Yes, through the header | Through the crate's C API |
| Python | Yes, as a `pip` package | Yes, by embedding Python |
| Node.js | Yes, as an `npm` package with TypeScript types | Not planned |
| Lua | Yes, as a module | Yes, sandboxed |
| Zig, Swift, Ruby, Julia, R, PHP, Nim, D | Yes, through the header | Through their C APIs |
| Java, Kotlin, C#, Go | Yes, one call at a time from the start; in parallel from 3.3 | Not planned |
| Erlang, Elixir | Yes, through dirty NIFs; in parallel from 3.3 | Not planned |
| WebAssembly | Not yet | Not yet |

WebAssembly is the one gap we know we want to close but cannot yet. Turf's garbage collector needs to read the program's stack, and WebAssembly does not let it. That needs its own design.

As for timing: native code in packages comes first, in 2.7. Wrapping C libraries comes in 2.8, and building Turf as a library for other languages in 2.9. The Python, Node.js and Lua tools live in their own repositories and come after 2.9, each when it is ready. Calls in parallel come in 3.3, after threads.

You may notice that this moves 3.0 back. We said last time that 2.9 would be the last 2.x release. To fit this in before the break, two releases were added, and the last one is now 2.11. We think that is worth it. The way Turf's libraries talk to other languages is exactly the kind of decision we want a chance to correct in 3.0 if we get it wrong in 2.x.

## A common playground

Here is the part we are most excited about, and it is not a feature.

If Turf can be reached from Python, JavaScript, Rust, Lua and C, then people from all of those communities can reach Turf. Each of them brings a different way of breaking things:

- A **C programmer** knows how to hand a library a pointer it did not expect.
- A **Rust programmer** knows exactly which aliasing and lifetime mistakes a type system should have caught.
- A **Python developer** will call a function from twelve threads and a garbage collector at once, just to see.
- A **JavaScript developer** will pass a typed array, change it halfway through the call, and ask what happened.
- A **security researcher** will write a Lua script whose only goal is to get out of the sandbox.
- A **fuzzing person** will just throw a few billion inputs at all of it.

**We want all of you.** Turf makes promises: safe code cannot corrupt memory, a handle cannot be used after it is released, a sandboxed script cannot reach the file system, and a call from another language cannot break Turf's heap. Our constitution says that a claim is not true until it is demonstrated, and the best demonstration is a lot of clever people trying very hard to prove it false.

This already works. [turf-fuzz](https://github.com/turf-lang/turf-fuzz), our fuzzing project, once found that plain safe Turf code could corrupt the heap: the compiler computed some struct sizes with the wrong data layout, so copying an array of them wrote past the end of its block. It was found by a machine, fixed, and is now a test that runs on every change. That is the cycle we want to run with many more people.

If you break something, [open an issue](https://github.com/turf-lang/turf-lang/issues). A short program that shows the problem is the most valuable thing you can send. Each confirmed finding becomes a test in the compiler, so it cannot quietly come back.

If what you found could be used against someone who runs a Turf program, such as safe code that corrupts memory, a check that can be bypassed, or a script that escapes its sandbox, please report it privately instead. Our [security policy](https://github.com/turf-lang/turf-lang/security/policy) says how, and you will be credited in the advisory and the release notes.

## What we are not promising

The usual honest notes:

- **This is a plan.** Six proposals are written ([TDP-2-029](/tdp/2-029/) to [TDP-2-033](/tdp/2-033/), and [TDP-3-003](/tdp/3-003/)). All of them are drafts. They can change, and some parts may be turned down.
- **Turf does not make other languages safe.** It keeps its own side safe, and it makes the boundary visible and checked.
- **Wrappers are only as true as their rules.** If a C function's annotation says it borrows a pointer when it really keeps it, the compiler cannot know. Every such rule is written down where a reviewer can see it.
- **None of the examples compile today.** They show the direction.

## What you can do

Read the proposals and tell us what is wrong with them. If you maintain a C library, tell us what a binding to it would need. If you write Python extensions, Node.js addons or Lua modules, tell us what you wish your current tools did. And if you like to break things, the playground will be open. Bring your favourite language.
