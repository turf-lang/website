---
major: 2
number: 6
title: Tests in source files
description: Let a function marked `@test` live beside the code it checks, and run it with `turf test`.
status: accepted
date: 2026-10-15
updated: 2026-10-25
authors:
  - Turf Team
---

## Summary

A test belongs next to the code it checks. This proposal adds an `@test` marker for a function in an ordinary source file. `turf test` finds those functions, runs each one, and reports which passed. A function marked `@test` is left out of a normal build, so it adds nothing to a program you ship.

## Motivation

`turf test` already runs test suites, but a test lives in a file of its own, apart from the function it checks. For a small helper that is a lot of ceremony: a second file, an import, and a reminder to keep the two in step. Small functions are exactly the ones that most need a quick check and are least likely to get one.

A test written beside its function also doubles as an example. A reader who wonders how `parse_port` behaves can read the test under it.

## Design

### The marker

```turf
fn parse_port(text: string): int {
    …
}

@test
fn parse_port_accepts_a_valid_port() {
    test::assert(parse_port("8080") == 8080);
}

@test
fn parse_port_rejects_zero() {
    test::assert(parse_port("0") == -1);
}
```

`@test` is a contextual keyword. It means something only in front of a function and does not reserve a word, so a function or variable named `test` keeps working. It follows the same shape as `@caller_location` and the `@deprecated` form from [TDP-2-003](/tdp/2-003/) (lint levels, deprecation and the compatibility contract).

### What a test function is

- It takes no parameters and returns nothing.
- It passes if it returns, and fails if it panics or an assertion fails.
- It may use everything in its file, private items included, because it is in the same file. That is the point of putting it there.
- It is not part of the module's exports.

### What `turf test` does

`turf test` compiles each source file in test mode, collects every `@test` function, runs each in a fresh process state, and prints one line per test with its name and result. A failing test shows the assertion and its location. The exit status is non-zero if any test failed. The existing test-suite files keep working and run in the same command.

In a normal `turf build` or `turf run`, a `@test` function is parsed and checked so that it cannot rot, but it is not emitted into the program. A program built without tests contains no test code.

### Tests that expect a failure

`@test` takes an optional argument that says how the test is expected to fail. Without one, a test passes if it returns.

```turf
@test(Error::E041, "Unknown function")
fn calling_an_undeclared_function_is_an_error() {
    undeclared(1);
}

@test(panic, "Division by zero")
fn dividing_by_zero_panics() {
    immut zero: int = 0;
    io::printline(10 / zero);
}
```

- **`@test(Error::E<code>, "text")`** expects the compiler to reject the function's body. It passes if every error reported inside the function has that code and at least one of them has a message containing `text` (`""` matches any message). The function must parse; its errors come from name resolution, type checking or flow analysis. It is never emitted or run. Its expected errors do not fail a normal build, which still checks the function; an error with a different code inside it, or one outside it, is an ordinary error.
- **`@test(panic, "text")`** expects the function to panic. It passes if the test's process ends in a panic whose message contains `text`. A panic cannot be caught (`FREEZE.md` F-PANIC-1), so `turf test` runs each such test in a process of its own and reads its exit status and stderr.
- `Error` and `panic` mean this only inside `@test(...)`. They reserve nothing, and the code is checked against the compiler's registry: an `E` code that does not exist is an error.

These replace, for a test written in Turf, what the compiler's own suite expresses with file names (`fail_*.tr`) and `// EXPECT-DIAG:` / `// EXPECT-RUNTIME:` comments, so the expectation is part of the program instead of a comment beside it.

### Where tests may appear

A `@test` function may appear at the top level of a source file. It may not be generic, and it may not be nested inside another function. These limits keep discovery simple and the rule easy to state.

## Constitution check

- **I. Safe by default, unsafe by declaration.** Not affected. A test is ordinary safe code, and an `unsafe` operation in a test needs `unsafe` like anywhere else.
- **II. Native performance, with costs you can read.** Not affected. Tests are excluded from a normal build, so the compiled program is the same size and speed as before.
- **III. The compiler is the authority.** The compiler decides what is a test and checks it with the same rules as the rest of the file, even when it is not run.
- **IV. Nothing crosses a boundary implicitly.** Tests run only under `turf test`. A build never runs one.
- **V. A few general mechanisms, not many special cases.** The `@` marker is the general form for attaching meaning to a declaration. `@test` is one more use of it.
- **VI. It works when you install it.** `turf test` already ships, so no new tool or download is needed.
- **VII. Stability is a promise.** `@test` is new surface and cannot change the parse of an existing program. A program using `test` as an identifier compiles as before.
- **VIII. A claim is not true until it is demonstrated.** This proposal exists to make claims about code cheap to demonstrate, and the standard library can adopt it for its own checks.

The Non-Goals hold. This asks for no borrow checker and no no-runtime targets, and no model is involved.

## Migration

Nothing breaks. Existing test-suite files keep working, and no existing code needs `@test`. A project may move tests beside their functions gradually.

## Verification

- Tests of the discovery rules: a top-level `@test` is found, a nested or generic one is an error.
- A test that a program with `@test` functions builds to the same object code as the same program with them removed.
- A test that a failing and a passing `@test` give the right output and exit status.
- A test that a program with an identifier named `test` is unaffected.
- For `@test(Error::E…, "…")`: a test passes when its body raises that code with that text, fails when the body compiles, fails when it raises a different code, and an unknown code is an error; a normal build of the file succeeds.
- For `@test(panic, "…")`: a test passes when the body panics with that text, fails when it returns or panics with another message, and the other tests in the file still run.

## Drawbacks

- Source files get longer. Teams that prefer tests in a separate tree can keep doing that.
- A test beside its code can see private items, which makes it easy to test internals and hard to refactor them. This is a common trade, and the choice is the author's.
- The compiler must check test code in every build even though it does not emit it, which costs a little compile time.

## Alternatives

- **Do nothing.** Tests stay in separate files. Rejected: that is the barrier this proposal exists to lower.
- **A `test { }` block.** Rejected: a block would need a new keyword and a place in the grammar, where a marker on a function reuses something that exists.
- **A naming convention such as `test_*`.** Rejected: a convention makes a function a test by accident, and the compiler would have to match a name, against Principle V.

## Unresolved questions

- Whether a test can be skipped. (Expected failures are `@test(Error::…)` and `@test(panic, …)` above.)
- Whether a test may return an error value instead of panicking, so `try` works inside it.
- How tests are ordered, and whether they may run in parallel once the runtime supports it.
- Whether `@test` functions should show up in the generated package documentation.
