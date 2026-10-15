---
major: 2
number: 18
title: Safe library interfaces
description: Count and report a package's unsafe code, warn when a raw pointer leaks through its public API or a method is called through one, and make both errors in 3.0.
status: draft
date: 2026-10-15
authors:
  - Turf Team
---

## Summary

The goal is that a Turf library can wrap C, keep every `unsafe` line inside itself, and present a safe API. This proposal supplies the missing visibility and rules. `turf graph` and a readable `turf audit` report each package's unsafe surface. A raw pointer in a package's `pub` API becomes a warning. A method call through a raw-pointer receiver becomes a warning in 2.2. In 3.0 both become errors. Together with the checking mode of [TDP-2-015](/tdp/2-015/) (runtime debug checks), a memory error in a program always traces to a named unsafe region in a named package.

## Motivation

What exists is the right foundation: `unsafe { }` blocks, the per-file `unsafe module;` capability, and `[unsafe] allow` in `turf.toml` that grants a package by name. Three gaps remain:

- **No one can see the unsafe surface.** To know how much unsafe code a dependency contains, a person must read it.
- **A wrapper can leak a raw pointer.** A library may return a raw pointer from a `pub` function, handing unsafety to every caller while appearing safe.
- **A known gap in the rules.** A method call through a raw-pointer receiver, such as `a.next.get()` with `next: Node*`, needs no `unsafe { }` today, though it dereferences a raw pointer.

## Design

### What "guarantee safety" means

The compiler cannot prove C code correct. The guarantee is this: *safe Turf code cannot corrupt memory, including through a library's API. Only code marked `unsafe`, in Turf or in C, can, and that code is confined to packages that declare it, counted by `turf`, allowed by name in the consumer's manifest, and checked at run time in test builds.* This is Principles I and IV applied to packages. No amendment to the Constitution is needed.

### The unsafe-surface report

`turf graph` and a readable `turf audit` list, per package:

- the files that declare `unsafe module;`
- the number of `unsafe { }` blocks
- the `extern fn` declarations
- native C sources ([TDP-2-016](/tdp/2-016/), native code in packages and checked boundaries)
- whether the consumer's `[unsafe] allow` grants the package

```text
package png 1.2.0
  unsafe modules:  2
  unsafe blocks:   14
  extern fns:      9
  native sources:  1
  allowed by this project: yes
```

The compiler supplies the counts through the package-graph output, which is a versioned schema, and `turf` formats them.

### Raw pointers in the public API

A raw pointer type (`ptr`, `T*`) in a package's `pub` API is a warning from 2.6. The rule for 3.0 is decided here: it is an error unless the code holds the raw-pointer capability itself. A library should wrap the pointer in a struct or a safe reference (the checked contracts in [TDP-2-016](/tdp/2-016/), native code in packages and checked boundaries, exist for this), so callers need no `unsafe`.

### Raw-receiver method calls

A method call whose receiver is a raw pointer is a warning in 2.2 and an error in 3.0:

```turf
unsafe {
    value = node.next.get();
}
```

The 3.0 migration wraps the call in `unsafe { }` automatically, since the call's meaning does not change.

## Constitution check

- **I. Safe by default, unsafe by declaration.** This closes two places where unsafe behaviour had no declaration: a raw pointer in a public API and a raw-receiver call.
- **II. Native performance, with costs you can read.** Not affected. Everything here is a compile-time check or a report.
- **III. The compiler is the authority.** The compiler produces the counts and decides which calls need `unsafe`, deterministically.
- **IV. Nothing crosses a boundary implicitly.** A package boundary now shows its unsafe surface, and a pointer cannot cross it unmarked.
- **V. A few general mechanisms, not many special cases.** It builds on the existing `unsafe` marks and the existing allow list.
- **VI. It works when you install it.** `turf audit` is part of `turf` and needs no extra download.
- **VII. Stability is a promise.** Both rules are warnings in 2.x, with at least two minors in the field. The errors arrive in 3.0 with an automatic migration for the raw-receiver call and documented steps for the API rule.
- **VIII. A claim is not true until it is demonstrated.** The report's counts are tested against known packages, and each warning has a failing and a passing test.

The Non-Goals hold. This does not add a borrow checker. It asks for no no-runtime targets, and no model is involved.

## Migration

In 2.x nothing breaks: both are warnings, and they can be silenced with lint levels. In 3.0, `turf migrate 3.0` wraps raw-receiver calls in `unsafe { }`. A package exposing a raw pointer must wrap it in a struct or a safe reference, using contracts for bindings.

## Verification

- Tests of the report against packages with known counts of each kind.
- A failing and a passing test for each warning, and the false-positive record over the standard library, tests, showcase and examples.
- A test that `lint-set = "3.0"` reports both as errors on 2.8.
- A test that the migration produces code that compiles and keeps its meaning.

## Drawbacks

- Counting `unsafe` blocks is crude: ten small blocks may be safer than one large one. The report presents counts, not a verdict.
- A library that exposes a raw pointer on purpose must now redesign its API by 3.0.
- Two rules and a report are more surface to document.

## Alternatives

- **Forbid raw pointers in public APIs outright.** Possible. The chosen rule allows code that holds the capability, to keep systems libraries workable.
- **Do nothing.** Leaves the gap in the pointer rules open.
- **Ban `unsafe` in dependencies.** Rejected: C wrappers need it.

## Unresolved questions

- Whether the 3.0 rule is "forbidden" or "allowed with the capability", to be settled before acceptance.
- How the report treats generated or macro-free helper code.
- Whether `turf audit` can fail a build when a package is not allowed, as an option.
