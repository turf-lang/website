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

- It takes no parameters, and returns nothing or `!void`.
- It passes if it returns, and fails if it panics or an assertion fails.
- It may use everything in its file, private items included, because it is in the same file. That is the point of putting it there.
- It is not part of the module's exports.

### What `turf test` does

`turf test` compiles each source file in test mode, collects every `@test` function, runs each in a fresh process state, and prints one line per test with its name and result. A failing test shows the assertion and its location. The exit status is non-zero if any test failed. The existing test-suite files keep working and run in the same command.

In a normal `turf build` or `turf run`, a `@test` function is parsed and checked so that it cannot rot, but it is not emitted into the program. A program built without tests contains no test code.

### How a test is expected to end

`@test` takes an optional **outcome**: how the test is expected to end. Without one, a test passes if its body returns (or, for a `!void` test, returns without an error). The outcome comes first; options (`skip:`, `timeout:` and the rest, [TDP-2-026](/tdp/2-026/)) follow it as `name: value` pairs.

```turf
@test(compile_error, E041, "Unknown function")
fn calling_an_undeclared_function_is_an_error() {
    undeclared(1);
}

@test(panic, "Division by zero")
fn dividing_by_zero_panics() {
    immut zero: int = 0;
    io::printline(10 / zero);
}

@test(error, FsError::RemoveFileFailed)
fn removing_a_missing_file_fails(): !void {
    try fs::remove_file("no/such/file");
}
```

| Outcome | Passes when | What the compiler's own suite writes today |
|---|---|---|
| none | the body returns (a `!void` body: without an error) | a plain test file |
| `compile_error, E<code>, "text"` | the compiler rejects the body: every error inside it has that code, and one message contains `text` | `fail_*.tr` + `// EXPECT-DIAG:` |
| `compile_error, E<code>, "text", fix: "text"` | as above, and the compiler prints a `Fix:` line containing the second text | `// EXPECT-FIX:` |
| `warning, E<code>, "text"` | the body compiles with that warning, and then runs and returns | `// EXPECT-DIAG:` on a warning |
| `no_warnings` | the body compiles with no warning at all, and then runs and returns | `// EXPECT-NO-DIAG` |
| `panic, "text"` | the body panics with a message containing `text` | `// EXPECT-RUNTIME:` |
| `exit, <status>` | the body ends the program through `sys::exit(<status>)` | `// EXPECT-EXIT:` |
| `error, <Type>::<Variant>` | the `!void` body returns that error value | nothing yet |

Rules:

- **`compile_error`** tests are never emitted or run. Their expected errors do not fail a normal build, which still checks the function; an error with another code inside it, or any error outside it, is an ordinary error. The body must parse: its errors come from name resolution, type checking or flow analysis. A syntax error, or an error about a declaration rather than a body, cannot be expressed this way, and stays a `fail_*.tr` file.
- **`panic`** and **`exit`** end the process, and a panic cannot be caught (F-PANIC-1), so `turf test` runs each such test in a process of its own and reads its exit status and stderr. Every other test may share a process.
- **`error`** needs a `!void` test. The variant is resolved like any other `E::V`, so it names a real error type of the program.
- `""` matches any message. An `E` code is checked against the compiler's registry: a code that does not exist, or a `warning` code that is an error (or the reverse), is itself an error.
- The outcome words (`compile_error`, `warning`, `no_warnings`, `panic`, `exit`, `error`) mean this only as the first argument of `@test(...)`. They reserve nothing.
- Arguments are literals, codes and variant names only, never expressions: whether a test exists and what it expects is known without running anything (Principle III).

**Why `compile_error` and not `Error::E041`.** `Type::Variant` is how Turf already writes an error value, so `Error::E041` would mean a variant `E041` of an error type named `Error` if a program declared one. Under Principle V a program's own declaration never loses to a built-in meaning of the same spelling, so the outcome is its own word, as `panic` and `exit` are.

These forms let a test written in Turf say everything the compiler's own suite says with file names and `// EXPECT-*` comments, so the expectation is part of the program instead of a comment beside it. Moving the suite over is the roadmap's F-11e.

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
- For each outcome in the table, one test that passes and one that fails for each way it can fail (no error, another code, another message, no `Fix:` line, another warning, any warning, another panic message, another exit status, another error variant), with the other tests in the file still run.
- A normal build of a file holding `compile_error` tests succeeds; an unknown code, and a `warning` code used for an error, are errors.
- A program that declares its own error type named `Error` is unaffected.

## Drawbacks

- Source files get longer. Teams that prefer tests in a separate tree can keep doing that.
- A test beside its code can see private items, which makes it easy to test internals and hard to refactor them. This is a common trade, and the choice is the author's.
- The compiler must check test code in every build even though it does not emit it, which costs a little compile time.

## Alternatives

- **Do nothing.** Tests stay in separate files. Rejected: that is the barrier this proposal exists to lower.
- **A `test { }` block.** Rejected: a block would need a new keyword and a place in the grammar, where a marker on a function reuses something that exists.
- **A naming convention such as `test_*`.** Rejected: a convention makes a function a test by accident, and the compiler would have to match a name, against Principle V.

## Unresolved questions

- Skipping, time limits, optimization levels, expected output, tags and serial tests are options, in [TDP-2-026](/tdp/2-026/).
- Table-driven tests (one function run for each row of a table) would need a test to take parameters; that is a separate amendment if it is wanted.
- How tests are ordered, and whether they may run in parallel once the runtime supports it.
- Whether `@test` functions should show up in the generated package documentation.
