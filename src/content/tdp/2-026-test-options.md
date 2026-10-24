---
major: 2
number: 26
title: Test options
description: "Let a `@test` say how it is run: `skip:`, `timeout:`, `levels:`, `stdout:`, `tag:` and `serial`."
status: accepted
date: 2026-10-25
authors:
  - Turf Team
---

## Summary

[TDP-2-006](/tdp/2-006/) gives a test an **outcome**: how it is expected to end. This proposal adds **options**: how it is run. They follow the outcome inside `@test(...)` as `name: value` pairs: `skip:`, `timeout:`, `levels:`, `stdout:`, `tag:`, and the bare word `serial`. All are additive and ship after `@test` itself.

## Motivation

A test suite needs more than pass or fail. A test that is temporarily broken needs to be set aside without being deleted. A test that hangs must not block the whole run. A claim that optimization levels never change behaviour (F-OPT-1) is only shown by running the same test at every level. A short expected output is clearer next to the test than in a separate `.expected` file. And a large suite needs subsets, such as the tests that touch the network.

The compiler's own suite does each of these today with runner flags, file-name conventions and separate files. Options let a test written in Turf say them where the test is.

## Design

```turf
@test(skip: "waits for TDP-2-011's iteration protocol")
fn list_for_each() { ... }

@test(panic, "Division by zero", timeout: 2000, levels: all)
fn dividing_by_zero_panics() { ... }

@test(stdout: "3\n0: h\n1: i\n", tag: "strings")
fn walks_a_string() { ... }

@test(tag: "net", serial)
fn binds_port_8080(): !void { ... }
```

| Option | Value | Meaning |
|---|---|---|
| `skip:` | a string, required and non-empty | The test is compiled and checked but not run. `turf test` lists every skipped test with its reason and counts them apart from passes. |
| `timeout:` | an `int`, milliseconds, greater than 0 | The test fails if it has not ended within that time. It then runs in a process of its own, which is killed on time-out. Turf has no duration literal, so the unit is fixed and named here. |
| `levels:` | `all`, or a list such as `[O0, O2]` | The test is built and run at each listed optimization level, and fails if any one fails. The default is the level `turf test` was given. |
| `stdout:` | a string | What the test prints to stdout must equal it exactly. Without it, output is not checked. |
| `tag:` | a string, or a list of strings | `turf test --tag net` runs only tests with that tag; `--skip-tag net` runs the others. |
| `serial` | none | The test never runs at the same time as another test. Until tests run in parallel this changes nothing; it is accepted now so suites can mark such tests in advance. |

Rules:

- Options come after the outcome, in any order, each at most once. An unknown option name, or a value of the wrong kind, is an error with a hint listing the options.
- Values are literals only (strings, `int`s, the words `all`, `O0` … `O3`, `Os`), never expressions, so what a test does is known without running it (Principle III).
- `skip:` combines with any outcome; the outcome is still checked for well-formedness. A `compile_error` test with `skip:` is still compiled, since skipping only means not counting its result.
- `timeout:` and `stdout:` need a test that runs: with `compile_error` they are errors.
- The option names mean this only inside `@test(...)`. They reserve nothing.

## Constitution check

- **I. Safe by default, unsafe by declaration.** Not affected.
- **II. Native performance, with costs you can read.** Not affected: tests are never part of a normal build. `levels:` multiplies a test's build time, visibly, at the test.
- **III. The compiler is the authority.** Options are literals the compiler checks; a malformed option is a compile error, not a runner surprise.
- **IV. Nothing crosses a boundary implicitly.** Not affected. There are no setup or teardown hooks that would run code around a test unseen.
- **V. A few general mechanisms, not many special cases.** Options use the `@` marker's argument list, the same one the outcome uses.
- **VI. It works when you install it.** `turf test` runs them; nothing else is needed.
- **VII. Stability is a promise.** Additive: every option is new surface inside `@test(...)`.
- **VIII. A claim is not true until it is demonstrated.** `levels: all` turns F-OPT-1 into something each test can demonstrate; `skip:` keeps a set-aside test visible instead of deleted. There is deliberately no retry option: a test that passes on its second try has demonstrated nothing.

The Non-Goals hold: no borrow checker, no no-runtime targets, no AI in the compilation path.

## Migration

Nothing breaks.

## Verification

- For each option, a test that it does what the table says, and a `compile_error` test for each misuse (unknown name, wrong value kind, empty `skip:` reason, a repeated option, `timeout:` or `stdout:` on a `compile_error` test).
- `timeout:` on a test that loops forever fails it within the limit and the other tests in the file still run.
- `levels: all` on a test whose output differs between levels (built by hand in `unsafe` code) fails at the differing level and names it.
- `turf test --tag` and `--skip-tag` select exactly the tagged tests.

## Drawbacks

- Each option is something every test runner has to support, including the compiler's own suite when F-11e moves it to `@test`.
- `levels: all` makes a suite four times as slow to build where it is used.

## Alternatives

- **Runner flags only.** `turf test --timeout`, `--levels`. Rejected as the whole answer: a test that needs a time limit or every level needs it every time it runs, so the requirement belongs with the test. The flags can still set defaults.
- **Retries for flaky tests.** Rejected (Principle VIII).
- **Setup and teardown hooks.** Rejected: hidden code around a test (Principle IV). A test calls its own helper.

## Unresolved questions

- Whether `stdout:` should also have a "contains" form for long outputs.
- Whether a project can set default options (a `[test]` table in `turf.toml`).
