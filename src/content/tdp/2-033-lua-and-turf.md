---
major: 2
number: 33
title: Lua and Turf
description: "`turf-lua`: Lua modules written in Turf, loadable with `require`; and a `lua` package that embeds a sandboxed Lua in a Turf program for configuration, scripting and plugins, with no `longjmp` ever crossing a Turf frame."
status: draft
date: 2026-10-25
authors:
  - Turf Team
---

## Summary

`turf-lua` is a tool and a Turf package in their own repository, for Lua 5.4.

- **Lua requires Turf.** From a Turf library built by `turf build --lib` ([TDP-2-030](/tdp/2-030/)), `turf-lua build` generates a Lua C module (`luaopen_<package>`) that `require` loads. Exported functions become Lua functions, handles become userdata with `__gc` and `__close`, and errors are raised as Lua errors.
- **Turf embeds Lua.** A `lua` package builds Lua from source into the program and gives Turf a `lua::State`. It is sandboxed by default, with no file, OS or module access and with optional memory and instruction limits. That makes it a safe way to add configuration, scripting and plugins to a Turf program. Turf functions can be registered for scripts to call.

Lua reports errors with `longjmp`, which must never jump across Turf frames. Both directions are built so that it cannot.

## Motivation

Lua is the most widely embedded scripting language: games, Neovim, Redis, nginx through OpenResty, network equipment. It is a small C library with a single-threaded API, which fits a Turf runtime with one mutator exactly. For Turf it is useful both ways. Lua users get fast, memory-safe native modules, and Turf programs get a scripting layer without writing an interpreter.

## Design

### The `longjmp` rule

When Lua raises an error, it unwinds with `longjmp` to the nearest protected call. Jumping over Turf frames would skip their `defer` statements and leave the collector scanning a stack whose frames no longer exist. So:

- **Turf code never calls a Lua API function that can raise.** In Lua 5.4 almost every API function can raise, if only on memory exhaustion. The `lua` package therefore makes every call through a C shim that runs the operation inside `lua_pcall` and returns a status, which the Turf side turns into a `!T` error.
- **Lua never calls Turf code directly.** A generated C function sits between them. It reads and checks the Lua arguments (where a `luaL_check*` failure may `longjmp`, over C frames only), calls the Turf function, pushes the results, and raises a Lua error only after Turf has returned.

These two rules are what make the binding safe. Both are enforced by construction, since the shims and glue are generated or live in the package, and both are tested.

### Lua requires Turf

```turf
// src/lib.tr in package `slug`

/// Lowercase, dashes for spaces, nothing else.
@export
pub fn make(title: string): string { ... }
```

```lua
local slug = require("slug")
print(slug.make("Hello World"))   -- hello-world
```

| Turf | Lua | At the boundary |
|---|---|---|
| `int`, `int32` | integer | Lua 5.4 integers are 64-bit, so `int` is exact; a float with an integral value is accepted |
| `double` | float | |
| `bool` | boolean | |
| `string` | string | Copied; a Lua string containing a zero byte is an error |
| `Slice<char>` | string | Copied, since Lua strings are immutable |
| `&T` handle | full userdata with a metatable | `__gc` releases it; `__close` runs the method marked `@ownership(releases: self)`; `__index` holds the exported methods |
| `!T` error | a raised error whose value is a table `{ code = "NotFound", message = "..." }` | Caught with `pcall` |

With Lua 5.4's to-be-closed variables, `local img <close> = png.open(path)` closes the handle when the block ends.

A module must not link its own copy of Lua, since the host already has one. On Windows the module links the host's `lua54.dll` import library, which `turf-lua build` takes as an option. LuaJIT users can skip the glue and load the shared library with LuaJIT's `ffi` and the generated header.

### Turf embeds Lua

```turf
import lua;

fn log_line(args: &lua::Args): !lua::Value {
    printline(try args.string(1));
    return lua::nil();
}

fn main(): int {
    immut L: &lua::State = lua::State::new();      // sandboxed
    defer L.close();

    L.set("width", lua::int(80));
    L.register("log", log_line);
    L.run("for i = 1, 3 do log('line ' .. i) end") recover run {
        printline("script failed");
    };
    printline(L.get("width").as_int() recover produce 0);
    return 0;
}
```

- **The library.** The package builds Lua 5.4's C sources from its `[native] sources` ([TDP-2-016](/tdp/2-016/)), so a program that uses it needs no system Lua.
- **The sandbox.** `State::new()` opens only the base, string, table, math, utf8 and coroutine libraries, with `load`, `loadfile`, `dofile` and `require` removed. `State::with_libs([...])` opts into more, including `io` and `os`.
- **Limits.** `L.set_memory_limit(bytes)` installs a counting allocator, and `L.set_instruction_limit(n)` installs a count hook. Exceeding either is a Lua error the script cannot catch, which `run` returns as a `!T` error.
- **Errors.** A Lua error, including a script's `error(...)`, becomes `lua::Error` with the message and a Lua traceback. It is never a panic.
- **Functions for scripts.** `register` takes a function value. A function with captures (closures, [TDP-2-009](/tdp/2-009/)) is rooted for the life of the state, so the collector keeps its environment alive while only Lua holds it.
- **Values.** `lua::Value` copies Lua scalars and strings into Turf. A Lua table or function stays in Lua and is reached through a `lua::Ref` handle whose `close()` is `@ownership(releases: self)`, backed by Lua's registry.

## Constitution check

- **I. Safe by default, unsafe by declaration.** The `longjmp` rule keeps Lua's error mechanism out of Turf frames. Scripts are sandboxed by default, so an embedded script cannot reach the file system unless the program grants it.
- **II. Native performance, with costs you can read.** Copies are in the table. Lua is compiled into the program like any `[native]` source.
- **III. The compiler is the authority.** Not affected.
- **IV. Nothing crosses a boundary implicitly.** Scripts see only what the program `register`s and `set`s; Lua sees only `@export` functions.
- **V. A few general mechanisms, not many special cases.** `[native]` sources, contracts and handles, as for any C library.
- **VI. It works when you install it.** No system Lua is needed for embedding.
- **VII. Stability is a promise.** Additive.
- **VIII. A claim is not true until it is demonstrated.** See Verification.

The Non-Goals hold: no borrow checker, no no-runtime target, no AI in the compilation path.

## Migration

Nothing breaks.

## Verification

- **The `longjmp` rule.** Under ASan and `TURF_GC_STRESS`: a Lua error raised inside a registered Turf callback's caller, an out-of-memory error inside every shim, and a `luaL_check*` failure on every argument kind. In each case `defer` statements in Turf frames run exactly as written, or no Turf frame was ever between the jump and its target.
- **Modules.** A module loaded by the reference Lua 5.4 interpreter on each Tier 1 platform; every conversion row; `__gc` after `collectgarbage()`; `<close>`.
- **Embedding.** The sandbox (each removed function is absent), the memory and instruction limits, errors with tracebacks, a capturing callback surviving forced collections.

## Drawbacks

- **Every Lua call from Turf goes through `lua_pcall`**, which costs a little per call. It is the price of the `longjmp` rule.
- **Lua 5.4 only.** 5.1 and LuaJIT differ in their C APIs (LuaJIT users have `ffi`).
- **Another repository** to maintain.

## Alternatives

- **Compile Lua as C++, so errors are C++ exceptions.** It does not help: an exception unwinding through Turf frames is no safer than `longjmp`.
- **Expose the raw Lua C API to Turf.** Rejected: every call could `longjmp` over Turf code.
- **Use the system Lua.** Possible as an option. Building from source is the default, so embedding works when installed.

## Unresolved questions

- Whether errors from Turf modules should follow Lua's `nil, message` convention instead of raising.
- Whether coroutines that yield across a registered Turf function (`lua_yieldk`) are supported, or a yield there is an error.
