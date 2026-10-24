---
major: 2
number: 3
title: Lint levels, deprecation and the 2.x compatibility contract
description: Give every diagnostic code a level you can set, add a way to deprecate an API, and enforce the 2.x promise with a frozen test corpus and a code registry.
status: accepted
date: 2026-10-15
updated: 2026-10-25
authors:
  - Turf Team
---

## Summary

The 2.x line promises that a program which compiled and ran on 2.0.0 compiles and runs the same on every later 2.x. This proposal builds the machinery that keeps that promise honest and lets the compiler keep growing: lint levels for every diagnostic code (`allow`, `warn`, `deny`) with a `lint-set` pin, a `@deprecated` form, a frozen copy of the 2.0 test suite that must keep passing byte for byte, and a registry that lists every diagnostic code with its kind, the version it appeared in and its level. None of it adds source syntax beyond `@deprecated`, and none of it changes what an existing program does.

## Motivation

Almost every later proposal in the 2.x line adds a warning. Analysis checks for `unsafe` code, loops, recursion and leaks all land as warnings first. Today that is a problem for three reasons.

- **A warning cannot be silenced.** There is no `-Werror` or `--deny-warnings` in the driver, and no way to turn one warning off. A user who sees a new warning in a correct program has to edit the program to quiet it.
- **A deny flag would be unsafe across versions.** If a project fails its build on any warning, a new warning in 2.N+1 breaks a build that was fine on 2.N. That would break the compatibility promise from the side.
- **The promise is only a document.** Nothing in CI proves that 2.4 behaves like 2.0, and nothing lists the diagnostic codes in one place, so the release notes cannot automatically say which codes were added.

Removal has a similar gap. The 2.x rules allow removing an API only in 3.0, but there is no way to tell users in advance that an item is going away.

## Design

### Lint levels

Every diagnostic code is one of three levels:

| Level | Effect |
|---|---|
| `allow` | The diagnostic is not printed and does not count. |
| `warn` | The diagnostic is printed and the build goes on. This is the default for every warning. |
| `deny` | The diagnostic is an error: it is printed and the build fails. |

Levels are set in three places, from weakest to strongest: the compiler's default for the code, the project's `turf.toml`, and the command line.

```toml
[lints]
lint-set = "2.4"
allow = ["W031"]
deny  = ["W020", "W021"]
```

```text
turf build --deny W020 --allow W031
```

There is **no source syntax**. A level is a property of a project or a command, not of a line of code, so the program text is the same wherever it is built. Errors cannot be lowered: `allow` applies to warnings only, and an attempt to allow an error code is itself an error.

### The `lint-set` pin

`lint-set = "2.N"` freezes the set of warnings to those that existed in 2.N. A warning introduced in a later minor is treated as `allow` until the pin moves. This is what makes `deny` safe to use across upgrades: a project that denies warnings and pins `lint-set = "2.4"` does not fail on a warning that 2.5 adds. Without a pin, `--deny-warnings` is documented as upgrade-unsafe, and the manifest says so where it is set.

`lint-set = "3.0"`, available on 2.11, reports every breaking-register entry that applies to source code as an error, so a project can be ready for 3.0 before it upgrades ([TDP-2-020](/tdp/2-020/), TurfLang 3.0.0 and the end of 2.x).

### `@deprecated`

An item is deprecated with an attribute that carries the replacement:

```turf
@deprecated("use read_all instead")
export fn read_whole(path: string): !string {
    return read_all(path);
}
```

A use of a deprecated item produces a warning that quotes the message and points at the use. `turf doc` and the language server show the deprecation. `@` is already the spelling of `@caller_location`, and `deprecated` is meaningful only in this position, so it is a contextual keyword and does not reserve a new word. A deprecated item is never removed in 2.x. Removal is a 3.0 item, and the migration tool renames a use when the replacement has the same signature.

### The prelude-shadow check

A script that, for a proposed addition to a bare-callable prelude module, lists every program in `showcase/`, `examples/`, `tests/` and the standard library that declares the same name. A new bare-callable name can shadow or collide with a user's name, so this check gates additions the way the API lock gates removals.

### The compatibility corpus

The 2.0.0 test tree is copied, not moved, to `tests/compat/2.0/`. It is immutable, and every 2.x compiler must pass it byte for byte. A change that edits a test in that tree to make it pass is a 3.0 change, and CI says so. This extends the idea behind the standard library surface test from "the API did not change" to "the behaviour did not change".

### The diagnostic-code registry

One file lists every diagnostic code with its kind (error or warning), the version it first appeared in, and its default level. It is the single source for the table in the diagnostics reference and for the website's error pages. It also makes the release notes' list of added codes automatic.

## Constitution check

- **I. Safe by default, unsafe by declaration.** Not affected. A lint level never switches off a safety error. Errors cannot be allowed, and only warnings can be.
- **II. Native performance, with costs you can read.** Not affected. Levels are resolved before code generation and add nothing to a compiled program.
- **III. The compiler is the authority.** The compiler decides what a code means and which level applies, from a registry, deterministically. A tool never has to guess from message text.
- **IV. Nothing crosses a boundary implicitly.** A level is set explicitly in a manifest or on the command line. A new warning never turns into an error unless the project asked for `deny`, and the pin stops a new warning from reaching a project that has not chosen it.
- **V. A few general mechanisms, not many special cases.** One mechanism, three levels, applied to every code. No code has its own switch.
- **VI. It works when you install it.** Defaults stay as they are, so nothing needs configuring.
- **VII. Stability is a promise.** This proposal is how the promise is enforced: the frozen corpus, the pin and the registry.
- **VIII. A claim is not true until it is demonstrated.** The corpus is a demonstration that runs in CI on every change.

The Non-Goals hold. This asks for no borrow checker, no no-runtime embedded targets and no AI in the compilation path.

## Migration

Nothing breaks. With no `[lints]` table and no flags, every diagnostic behaves as it does today. The new `@deprecated` form is additive, and no existing item is deprecated by this proposal.

## Verification

- The `tests/compat/2.0/` corpus and its CI job, which compares output byte for byte.
- A test for each level: an `allow`ed warning is silent, a `deny`ed warning fails the build, an `allow` on an error code is rejected.
- A test that a code introduced after the pin stays silent under the pin.
- A check that the registry and the compiler agree: every code the compiler can emit is listed, and every listed code can be emitted.
- A test that a program using an identifier named `deprecated` still compiles.

## Drawbacks

- A frozen corpus is a permanent cost. It slows CI a little, and it makes fixing a wrong 2.0 behaviour a deliberate act.
- Levels add a second place to look when a diagnostic is missing. The output notes when a code was lowered by a project setting.
- The registry must be kept in step with every new code, which is one more step in adding a diagnostic. A check turns forgetting into a failing build.

## Alternatives

- **Do nothing.** Warnings stay unsilenceable, and every new warning is a risk to correct code.
- **Source-level suppression such as `@allow(W031)`.** Rejected: it adds syntax to every program for something that is really a project policy.
- **A bare `--deny-warnings`.** Rejected without the pin: it fails builds when a compiler is upgraded.
- **Rust-style editions.** Rejected in favour of a plain 3.0 with a migration tool.

## Unresolved questions

- The exact spelling of the codes in `[lints]`, and whether groups such as `unsafe` or `pedantic` can be named.
- Whether `--deny-warnings` is added at all, or only per-code `--deny`.
- How `@deprecated` interacts with a deprecated item that is re-exported.
- Whether the registry also records the page that explains each code.
