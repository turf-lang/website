---
major: 2
number: 19
title: "A pure compiler: turfc, libturf and the assistant"
description: Reduce `turfc` to a deterministic compiler, move the front end into a versioned library, and move the model assistant, formatter, migrator and test runner into their own tools.
status: proposed
date: 2026-10-15
updated: 2026-10-16
authors:
  - Turf Team
---

## Summary

`turfc` today is several tools in one binary. It compiles, but it also formats, migrates, runs tests, explains error codes and hosts a language model. This proposal makes it a compiler and nothing else. The front end becomes `libturf`, a library with a versioned API that `turfc`, `turf-lsp`, the formatter and the assistant all link, instead of compiling the compiler's sources. The assistant (the model runtime) becomes a separate binary and download. Format, migrate and test become one helper, and `explain` becomes data that `turf` reads. In 2.7 the old `turfc` flags forward and print a deprecation note. In 3.0 they are removed, and the separate `-smart` release flavour ends.

## Motivation

The mixture has costs:

- **The compiler carries a model runtime.** A `-smart` release flavour exists only because of it, which means two builds, two downloads and two sets of recipes.
- **Global state forces workarounds.** The lexer, parser and symbol table keep global state, so the `--smart` sandbox must save and restore it, and the language server builds the compiler from a source checkout.
- **Tools are coupled to a revision.** `turf-lsp` compiles the compiler's sources, so a compiler change can break the editor.
- **Determinism is not a stated promise.** The Constitution's Non-Goals say no model and no network are in the compilation path. The cleanest way to hold that is a compiler with no such code in it.

## Design

### What `turfc` is at 3.0

- **One job.** Source plus a package graph in, an executable, object or LLVM IR and diagnostics out.
- **One library.** The front end is `libturf`: reentrant, with a semantic model and a lowering IR between the syntax tree and LLVM. It is shipped in the release archive as headers and a static library.
- **Deterministic.** The same source, flags and compiler give byte-identical objects and executables, with build paths normalised in debug information. CI builds the corpus twice and compares.
- **One release flavour.** With the model runtime out of `turfc`, plain and `-smart` become one.

### `libturf`

`libturf` exposes lexing, parsing, resolving, type-checking, semantic queries, diagnostics, the lowering IR, and lowering to LLVM as a separate layer. Its API is versioned and the version appears in the compiler's interface manifest (`turfc --version --json`). `turf-lsp` links a released `libturf` through that API instead of using `add_subdirectory` on the compiler's sources.

### The assistant leaves

The model runtime, grammars and cache move into a separate binary and archive (working name `turf-assist`), found by `turf` on the `PATH` or beside `turf`. It reads the JSON diagnostics ([TDP-2-004](/tdp/2-004/), machine-readable diagnostics and applying fixes) and the source, re-checks candidates through `libturf`'s sandbox, and prints suggestions. `turf check --smart` invokes it. The compiler's own rule fixes stay in the compiler, since they involve no model. The main release carries no model runtime.

### Other modes leave

`--format`, `--migrate`, `--test` and `--explain` get new homes. `explain` becomes data from the diagnostic registry that `turf` reads directly. Format, migrate and test become one helper linked against `libturf`. **The `turf` commands keep their spelling throughout**: `turf fmt`, `turf migrate`, `turf test` and `turf explain`.

### The timeline

| When | What |
|---|---|
| 2.7 | `libturf` ships. The assistant and the helper exist. The old `turfc` flags still work and print a deprecation note naming the `turf` command. |
| 3.0 | `--smart`, `--smart-write-fix`, `--format`, `--migrate`, `--test` and `--explain` are removed from `turfc`. The `-smart` archives end. The driver interface major becomes 3. |

## Constitution check

- **I. Safe by default, unsafe by declaration.** Not affected. No language rule changes.
- **II. Native performance, with costs you can read.** Not affected for compiled programs. The compiler's own size and start-up improve.
- **III. The compiler is the authority.** This makes it literal: the compiler is the one binary whose output is deterministic, with no model in it.
- **IV. Nothing crosses a boundary implicitly.** The assistant is a separate download the user chooses, and tools reach the compiler through a versioned API.
- **V. A few general mechanisms, not many special cases.** One library serves every tool, instead of each tool carrying a copy of the front end.
- **VI. It works when you install it.** The main install needs no model. `turf` commands keep working, and a missing assistant is reported with how to get it.
- **VII. Stability is a promise.** The additive half ships in 2.7 with deprecation notes that name replacements. The removals are 3.0 items with a published migration, and the `turf` commands never change.
- **VIII. A claim is not true until it is demonstrated.** Reproducibility is checked in CI by building twice, and tool fixtures run in the compiler's CI.

The Non-Goals hold, and this proposal is how they are enforced: no AI in the compilation path. It asks for no borrow checker and no no-runtime targets.

## Migration

For `turf` users there is no change. For scripts that call `turfc --format`, `--test`, `--migrate`, `--explain` or `--smart` directly, the 2.7 notes name the `turf` command to use, and 3.0 removes the flags. Install recipes and download URLs change in 3.0.0 when the `-smart` archives end.

## Verification

- The API fixtures and each tool's own tests, run in the compiler's CI, so a compiler change that breaks a tool fails in the compiler's CI.
- Building the corpus twice and comparing every output byte for byte.
- A test that `turfc` links no model runtime, and that the plain build is the only build.
- A test that each deprecated flag forwards and prints its note in 2.7.
- The model-free replay suite running against the separate assistant.

## Drawbacks

- Splitting one binary into several is a real engineering cost, and it depends on removing the global state first.
- Users who want the assistant must install a second thing.
- A versioned library API is a promise that costs effort to keep.

## Alternatives

- **Keep everything in `turfc`.** The status quo, with its coupling and two flavours.
- **Make the assistant a plugin loaded by `turfc`.** Rejected: the compiler would still carry the plugin interface and a model-shaped hole in the compilation path.
- **Drop the assistant.** Possible if the benchmark says it does not earn its place ([TDP-2-008](/tdp/2-008/), measured suggestions and the benchmark). This proposal keeps the option open either way.

## Unresolved questions

- The final names of the assistant and the helper.
- The layout of the `libturf` API and how long an API major is supported.
- How the helper is distributed: in the main archive or beside it.
- How `turf explain` behaves offline when the registry data is missing.
