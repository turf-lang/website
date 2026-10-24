---
major: 2
number: 20
title: TurfLang 3.0.0 and the end of 2.x
description: Define what ships in 3.0.0, how 2.11 prepares for it, and how 2.x is supported and then discontinued.
status: proposed
date: 2026-10-15
updated: 2026-10-25
authors:
  - Turf Team
---

## Summary

3.0.0 is the release that finishes two aims: a pure compiler, and libraries you can trust with a way to ship them. This proposal sets out what 3.0.0 contains (the breaking register), how the last 2.x minor makes the upgrade a non-event, and the schedule for supporting and then ending 2.x. It is not an accumulation of breaks. An entry is on the list only because it could not go in a minor, and entries expected to be empty stay empty unless a soundness hole forces them.

## Motivation

A major version is a promise to users in both directions: that breaking changes are few and justified, and that the path across them is mechanical. Without a written plan, a major tends to collect whatever was inconvenient to do compatibly. And without a support window, users cannot know how long it is safe to stay on 2.x.

## Design

### 2.11: ready for 3.0

The last 2.x minor adds no feature. It makes the upgrade easy:

- `lint-set = "3.0"` reports every source-level breaking entry as an error on a 2.11 compiler.
- `turf migrate 3.0` performs every mechanical migration.
- Every deprecation that 3.0 removes has warned for at least two minors.
- The 3.0 migration guide is published on the website, beside "Migrating to 2".
- This proposal is accepted.

### The breaking register

| Change | Why it is breaking | Migration |
|---|---|---|
| Promote proven warnings to errors: mutual and unreachable-base recursion, selected `unsafe` checks, and any warning with two minors of field time and no reported false positive | Rejects programs that compile in 2.x | `lint-set = "3.0"` first, then `turf migrate 3.0` annotates sites |
| Runtime debug checks on by default at `-O0` | A program with latent memory corruption panics | `--no-debug-checks` |
| Remove items deprecated by `@deprecated` | Removal is not allowed before 3.0 | The message names the replacement, and `turf migrate` renames where the signature matches |
| Retire `lint-set` pins older than 2.11 | Pinned builds change | Documented |
| Raw pointers in a package's `pub` API ([TDP-2-018](/tdp/2-018/), safe library interfaces) | Rejects packages that compile in 2.x | Wrap the pointer in a struct or a safe reference |
| Raw-receiver method calls need `unsafe` ([TDP-2-018](/tdp/2-018/), safe library interfaces) | Rejects programs that compile in 2.x | `turf migrate 3.0` wraps the call |
| `turfc` is a compiler only ([TDP-2-019](/tdp/2-019/), a pure compiler) | Scripts calling removed flags fail | The `turf` commands are unchanged |
| One release flavour ([TDP-2-019](/tdp/2-019/), a pure compiler) | Install recipes and URLs change | Recipes and the download page updated |

Several other possible breaks are expected to stay **empty**: a collector write-barrier contract, new reserved words, a changed function-array type, a changed function-value layout, concurrency rules that reject code, a new manifest format major, and a different spelling for type arguments. An entry that turns out to be needed waits for 4.0 unless it closes a soundness hole.

### Releasing

1. 2.11.0 ships the pin, the migration tool and the guide.
2. 3.0.0 release candidates are cut from the main branch, as for 2.0. The registry's most-used packages are built against each candidate and their authors told of failures.
3. 3.0.0 ships with the register applied. The website's current documentation switches to 3.0, and the 2.x documentation moves to an archived section.

### The end of 2.x

The last 2.11.x receives **bug-fix and soundness patches for six months** after 3.0.0, with no features and no new warnings. Six months after 3.0.0, 2.x is end of life: no further 2.x releases, the Homebrew, Scoop and AUR recipes carry 3.x only, and the registry keeps serving existing 2.x-only versions but accepts new publishes only from packages whose `turf` requirement includes 3.x.

### 3.x

After 3.0.0, 3.0.x patches come first, and then additive minors again under the same rules, with 3.N in place of 2.N. Concurrency is the first 3.x theme ([TDP-3-001](/tdp/3-001/), threads and shared state, and [TDP-3-002](/tdp/3-002/), async and non-blocking I/O), designed so that it never requires a 4.0.

## Constitution check

- **I. Safe by default, unsafe by declaration.** 3.0 tightens it: unsafe checks promoted, raw receivers marked, debug checks default at `-O0`.
- **II. Native performance, with costs you can read.** Release builds are unaffected. The debug-check cost at `-O0` is the named one.
- **III. The compiler is the authority.** The migration is done by the tool and checked by the compiler. No user has to guess.
- **IV. Nothing crosses a boundary implicitly.** Every break is listed, with its reason and its migration.
- **V. A few general mechanisms, not many special cases.** One register, one pin and one migration tool.
- **VI. It works when you install it.** One release flavour and a defined set of recipes.
- **VII. Stability is a promise.** This proposal is the promise made concrete: a bounded register, a mechanical migration and a support window.
- **VIII. A claim is not true until it is demonstrated.** The migration is rehearsed on the registry's most-used packages before release.

The Non-Goals hold. 3.0 adds no borrow checker and no no-runtime targets, and removes the model from the compiler.

## Migration

This proposal is the migration plan. A project can prepare early with `lint-set = "3.0"` on 2.11. After upgrading it runs `turf migrate 3.0` and fixes what the tool cannot do.

## Verification

- `turf migrate 3.0` run over the standard library, the tests, the showcase and the examples, and over the registry's most-used packages.
- A test that every source-level register entry is an error under `lint-set = "3.0"` on 2.11.
- A check that each removed item warned for at least two minors.
- Release candidates built against real packages before the release.

## Drawbacks

- A major version is churn for users regardless of how mechanical the migration is.
- Maintaining 2.x for six months is a cost.
- A short register can tempt people to add to it. The rule that an entry must justify why it cannot be a minor is the guard.

## Alternatives

- **Editions instead of a major version.** Rejected: a plain 3.0 with a migration tool is simpler.
- **No major version, ever.** The two aims need breaks in a few places, and the soundness rules need them.
- **A longer or shorter window.** Six months balances users' need to move against the cost of old branches, and can be revisited with real numbers.

## Unresolved questions

- Whether any entry now marked empty is needed after the 2.x lines ship.
- Whether the support window should be extended for the registry's most-used packages.
- The exact date of the release candidates, which depends on the 2.x lines and has no calendar.
