---
major: 3
number: 2
title: Async and non-blocking I/O
description: Add tasks as a library first, then non-blocking I/O with an event loop, and TLS and UDP through a vetted C library.
status: draft
date: 2026-10-15
authors:
  - Turf Team
---

## Summary

A network server that handles many connections should not need one thread per connection. This proposal builds on threads ([TDP-3-001](/tdp/3-001/), threads and shared state) in three steps. Async as a **library** of stackful tasks on the thread-aware runtime, with no new syntax. Non-blocking I/O and an event loop. And TLS and HTTPS by binding a vetted C library, plus UDP. Stackless `async fn` and `await` are not proposed now. They are a later option, as contextual keywords, only if a measured need appears.

## Motivation

Blocking I/O makes a program wait. With one thread per connection, a server with thousands of clients needs thousands of threads, each with its own stack. A task is a much lighter unit that gives up its turn while it waits.

The standard library's `http` module also cannot speak HTTPS yet. Real services need transport security, and writing a TLS implementation is not a job for a small language team.

## Design

### Tasks as a library

The first shape is a library of **stackful tasks** that run on the runtime's threads. A task has its own small stack and is switched when it waits. No new syntax is needed: it is ordinary code that calls library functions.

```turf
import task;

fn handle(conn: Connection) {
    immut request = conn.read_request();
    conn.write(respond(request));
}

fn main() {
    immut listener = listen("0.0.0.0:8080");
    loop {
        immut conn = listener.accept();
        task::spawn(handle, conn);
    }
}
```

This reads like blocking code, which is the point: a reader does not have to learn a second way to write a function.

### The alternative, kept for later

The other shape is stackless `async fn` and `await`. They would be **contextual keywords**, meaningful only in one grammatical position, so a variable named `async` or `await` keeps working. The recommendation is to build the library first and add syntax only if the library measurably cannot do the job. A new reserved word would be a breaking change that waits for a major version.

### Non-blocking I/O and the event loop

The `io`, `net` and `fs` modules gain non-blocking operations over an event loop built on the platform's facility (epoll, kqueue or the Windows equivalent). When a task reads from a socket that has no data, it is suspended and the loop runs another. This is what makes the task model scale.

### TLS, HTTPS and UDP

TLS is provided by binding a vetted C library through the foreign function interface, using the native-code and checked-boundary features of [TDP-2-016](/tdp/2-016/) (native code in packages and checked boundaries). The unsafe core stays inside the standard library's wrapper, and a program using HTTPS contains no `unsafe`. UDP sockets join the `net` module.

## Constitution check

- **I. Safe by default, unsafe by declaration.** Tasks follow the thread rules of [TDP-3-001](/tdp/3-001/) (threads and shared state). The C library binding's unsafe code is confined to the standard library, behind checked contracts.
- **II. Native performance, with costs you can read.** A task's stack size and switch cost are documented. A blocking call inside a task is visible in the call, and the library says which calls suspend.
- **III. The compiler is the authority.** No new syntax means no new ambiguity. If keywords come later, the compiler decides their meaning from position alone.
- **IV. Nothing crosses a boundary implicitly.** A task is created by an explicit `spawn`, with a transferable argument. TLS is a named library, not a hidden dependency.
- **V. A few general mechanisms, not many special cases.** One task model and one loop serve files, sockets and timers. Syntax is added only if measured need requires it.
- **VI. It works when you install it.** The TLS library must be built into or shipped with the release, so HTTPS works from a fresh install.
- **VII. Stability is a promise.** All of it is additive library surface, and no keyword is reserved. `async` and `await` remain valid identifiers.
- **VIII. A claim is not true until it is demonstrated.** A server benchmark with thousands of connections demonstrates the scaling claim, and TLS is tested against real servers.

The Non-Goals hold. This asks for no borrow checker and no no-runtime targets, and no model is involved.

## Migration

Nothing breaks. Blocking I/O keeps working, and threads keep working. A program may move to tasks when it wants to.

## Verification

- A server test with thousands of simultaneous connections on a few threads, with memory and latency recorded.
- Tests that a suspended task does not block other tasks.
- TLS tests against a known-good server and client, including certificate failures.
- UDP tests of send, receive and loss.
- Collector stress tests with many tasks.
- A test that programs using `async` and `await` as names still compile.

## Drawbacks

- Stackful tasks use more memory per task than stackless ones would.
- Binding a TLS library adds a dependency to maintain and a place security fixes must follow.
- Two ways to do concurrent work, threads and tasks, mean guidance on when to use each.

## Alternatives

- **Stackless `async` and `await` first.** Rejected for now: it adds syntax and a split between async and normal functions.
- **Write TLS in Turf.** Rejected: security code should come from a vetted library.
- **No async.** Leaves servers needing a thread per connection.

## Unresolved questions

- The task stack size and whether stacks grow.
- Which TLS library is bound, and how its updates are tracked.
- The platform event-loop abstraction on Windows.
- The measurement that would justify adding stackless syntax.
