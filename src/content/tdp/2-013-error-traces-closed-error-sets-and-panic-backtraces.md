---
major: 2
number: 13
title: Error traces, closed error sets and panic backtraces
description: Show where an error travelled and where a panic happened, and let a function declare exactly which errors it can return.
status: proposed
date: 2026-10-15
authors:
  - Turf Team
---

## Summary

When an error reaches the top of a program, or a panic ends it, the reader sees the final message and not the path. This proposal adds three things. An error return trace records each `try` an error passed through, so the report shows the route. Panic backtraces print the call stack at a panic, with names and lines taken from the debug information the compiler already emits. And a function may optionally list the errors it can return, a closed error set, so a caller knows what to handle. The open `!T` form is the frozen design and does not change.

## Motivation

In a program where an error passes through five calls, the message "file not found" says what failed and nothing about which call chain led there. Finding it means adding prints.

A panic is similar. The panic line names the failure and its location, but not who called the failing function. For a bug found in a long run, the stack is what a person needs.

On the type side, `!T` means "a `T` or any error". That is flexible, and it leaves a caller unable to see which errors are possible without reading the callee.

## Design

### Error return traces

At each `try`, the compiler records the location (the same location `@caller_location` already provides) in a small trace attached to the error as it propagates. If the error is never handled and ends the program, the report prints the trace:

```text
error: file not found: config.toml
  returned from read_config   at config.tr:12
  returned from load_settings at settings.tr:30
  returned from main          at main.tr:8
```

A handled error discards its trace. The trace is bounded in length, and the oldest frames are dropped past the limit, with a note. It adds a small cost on the error path only. A successful return costs nothing.

### Panic backtraces

A panic prints its call stack after the panic line, with function names and file and line numbers resolved from the DWARF information produced under `-g`. A build without `-g` prints addresses and a note that names are unavailable. The output goes to standard error after the panic line, which the exit-status contract already treats as non-contract text, so exit statuses and the panic line are unchanged.

### Closed error sets

A function may name the errors it can return.

```turf
fn read_config(path: string): !Config error { NotFound, BadFormat } {
    …
}
```

It is **optional**. A function without the list is the open `!T` as before. When present, the compiler checks that every `try` and `return error` in the body is one of the listed errors, and a caller can match on the set exhaustively. Conversion between sets is explicit, so a function can map a lower-level error to one of its own. A closed set is accepted anywhere an open `!T` is expected.

## Constitution check

- **I. Safe by default, unsafe by declaration.** Not affected. A trace and a backtrace are reports only. A closed set makes unhandled errors visible.
- **II. Native performance, with costs you can read.** The trace costs only when an error propagates and is bounded. A backtrace costs only at a panic. A normal return path is unchanged.
- **III. The compiler is the authority.** The set is checked by the compiler, and the trace locations come from the compiler's own information.
- **IV. Nothing crosses a boundary implicitly.** A conversion between error sets is written, not inferred.
- **V. A few general mechanisms, not many special cases.** Traces reuse `@caller_location`, and sets extend the one error type.
- **VI. It works when you install it.** Backtraces use the debug information the compiler already emits, so no extra tool is needed.
- **VII. Stability is a promise.** Traces and backtraces add output after the existing lines. Closed sets are optional, and `!T` keeps its meaning.
- **VIII. A claim is not true until it is demonstrated.** Tests check each report and the exhaustiveness of sets, and the cost of the success path is measured.

The Non-Goals hold. This asks for no borrow checker and no no-runtime targets, and no model is involved.

## Migration

Nothing breaks. No function has to declare a set, and existing error handling is unchanged. A program that scrapes the text after a panic line may see more lines, which was never in the contract.

## Verification

- A test of the exact trace for a chain of `try`, and that a handled error leaves none.
- A test that a backtrace names the right functions under `-g`.
- A test that a closed set rejects an error not on its list and accepts one that is.
- A benchmark that a success path costs the same as before.
- A test that exit statuses and the panic line are unchanged.

## Drawbacks

- Traces and backtraces make failure reports longer.
- Closed sets add a second way to declare an error type, and a function may migrate between them, which changes its callers' expectations.
- Backtraces depend on debug information being present.

## Alternatives

- **Do nothing.** The status quo needs prints to find a path.
- **Always-on stack capture for every error.** Rejected: it costs on every error, even handled ones.
- **Only closed sets, no open form.** Rejected: the open union is the frozen design and a strength for quick programs.

## Unresolved questions

- The limit on trace length, and what is shown past it.
- How a set is written when it comes from several lower-level sets.
- Whether the backtrace is also written in JSON diagnostics.
- Whether a closed set may be generic.
