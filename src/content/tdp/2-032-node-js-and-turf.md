---
major: 2
number: 32
title: Node.js and Turf
description: "`turf-node`: build a Node-API addon and an npm package with prebuilt binaries from a Turf library, with TypeScript declarations, errors as JavaScript exceptions, typed arrays without copies, and handles released by the JavaScript collector."
status: draft
date: 2026-10-25
authors:
  - Turf Team
---

## Summary

`turf-node` is a tool in its own repository. From a Turf library built by `turf build --lib` ([TDP-2-030](/tdp/2-030/)) it generates a Node-API addon, a `.d.ts` file, and an npm package layout with one prebuilt binary per platform, so `npm install` needs no compiler. Calls are synchronous, `Promise`-returning variants run on a worker thread, and handles are released by the JavaScript garbage collector or explicitly with `using`. The compiler knows nothing about JavaScript. The tool ships after 2.9.0, at its own pace.

## Motivation

Node.js is where a great deal of tooling and server code lives, and its native addons are how it gets speed: esbuild, swc, sharp and bcrypt ship native code inside npm packages. Those addons are written in C++, Rust or Go. Turf can be a safer default for them. Node-API is a stable C ABI across Node versions, and JavaScript runs each isolate on one thread, which matches a Turf library's one-thread-at-a-time rule closely.

## Design

```turf
// src/lib.tr in package `imgsize`

/// Width and height of a PNG or JPEG.
@export
pub fn measure(data: Slice<char>): !&Size error { Unknown } { ... }

@export
pub fn Size.width(): int { return self.w; }
```

```ts
import { measure, Unknown } from "imgsize";

const size = measure(await readFile("a.png"));   // a Buffer, not copied
console.log(size.width());
```

**Conversions**, read from the export description:

| Turf | JavaScript | At the boundary |
|---|---|---|
| `int` | `number` when it fits in 2^53, otherwise `bigint`; accepts both | `RangeError` for a `number` that is not an integer |
| `int32`, `double` | `number` | |
| `bool` | `boolean` | |
| `string` | `string` | Copied, UTF-8 |
| `Slice<char>` | `Buffer`, `Uint8Array` | Not copied |
| `Slice<int32>`, `Slice<double>`, … | the matching typed array | Not copied; `TypeError` on a mismatch |
| `&T` handle | an instance of a generated class `T` | Released by a finalizer, or by `[Symbol.dispose]` |
| `!T` error | an exception class per error, extending `Error`, with a `code` property | |

**Handles.** Each handle is wrapped with `napi_wrap` and a finalizer that calls its release function, so the JavaScript collector decides when the Turf object goes. A type with a method marked `@ownership(releases: self)` also implements `[Symbol.dispose]`, so `using size = measure(buf);` closes it at the end of the block.

**Threads.**
- A call runs synchronously on the calling JavaScript thread.
- For every function, `turf-node` also generates `measureAsync(...)`, which returns a `Promise` and runs on libuv's thread pool. The entry lock serializes those calls with each other and with synchronous ones, so they free the event loop without running Turf in parallel. A `Slice` argument to an async call is copied first, because JavaScript may change the buffer while the call waits.
- Worker threads may call the same library; they take the entry lock like any other thread.

**Packages.** `turf-node pack` writes the layout esbuild and swc use: a main package with the JavaScript and `.d.ts`, plus one optional dependency per platform (`imgsize-linux-x64-gnu`, `imgsize-darwin-arm64`, …) carrying that platform's `.node` binary. npm installs only the one that matches. Cross-linking ([TDP-2-030](/tdp/2-030/)) builds every platform's binary from one machine.

**Panics.** A Turf panic ends the Node process (F-PANIC-1). The generated documentation says so, and recommends `!T` for every expected failure.

## Constitution check

- **I. Safe by default, unsafe by declaration.** The generated addon holds the `unsafe` code; a JavaScript user writes none. Typed arrays are checked for type before Turf sees them, and buffers passed to async calls are copied so JavaScript cannot change them underneath Turf.
- **II. Native performance, with costs you can read.** Synchronous slices are views; the copies (strings, async slices) are in the table.
- **III. The compiler is the authority.** Not affected.
- **IV. Nothing crosses a boundary implicitly.** Only `@export` functions appear in JavaScript.
- **V. A few general mechanisms, not many special cases.** Generated from the general export description.
- **VI. It works when you install it.** `npm install` downloads a prebuilt binary; no toolchain is needed.
- **VII. Stability is a promise.** Additive. Node-API is ABI-stable across Node versions, so one binary serves them all.
- **VIII. A claim is not true until it is demonstrated.** See Verification.

The Non-Goals hold: no borrow checker, no no-runtime target, no AI in the compilation path.

## Migration

Nothing breaks.

## Verification

- The package installed with npm, pnpm and Yarn on every Tier 1 platform, under the oldest and newest supported Node.js, and run under Bun and Deno's Node-API support where it is available.
- Every conversion row, including a `Buffer` written by Turf and read by JavaScript, a mistyped typed array rejected, and `bigint` round trips.
- A handle released by the JavaScript collector (`--expose-gc`, `global.gc()`) while Turf collections are forced; `using` disposing it.
- A hundred concurrent `*Async` calls and four worker threads: correct results, no two inside Turf at once, the event loop free while they run.

## Drawbacks

- **A panic ends the process**, as for Python.
- **Async calls do not run in parallel** before 3.1, and copy their slices.
- **One package per platform** to publish.

## Alternatives

- **WebAssembly instead of a native addon.** Not possible yet: the collector cannot scan a WebAssembly stack.
- **Only synchronous calls.** Simpler, but a long Turf call would block the event loop.
- **The JavaScript FFI packages** (`koffi`, `ffi-napi`) on the shared library. They stay possible, and lose types, exceptions and handle lifetimes.

## Unresolved questions

- Whether `int` should always map to `bigint`, which is exact but awkward, rather than switching on size.
- Whether to generate `*Async` variants for every function or only for those marked, for example `@export(async)`.
