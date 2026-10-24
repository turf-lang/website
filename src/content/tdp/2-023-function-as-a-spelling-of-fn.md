---
major: 2
number: 23
title: "`function` as a spelling of `fn`"
description: Accept `function` wherever `fn` starts a declaration in 2.3, as a contextual keyword, and make it a reserved word equal to `fn` in 3.0.
status: accepted
date: 2026-10-25
authors:
  - Turf Team
---

## Summary

`function` becomes a second spelling of `fn`. In 2.3 it is a contextual keyword, meaningful only where a function declaration starts, so a variable named `function` keeps compiling. In 3.0 it becomes a reserved word that the lexer reads as `fn` everywhere (breaking-change entry B-19).

## Motivation

A newcomer from JavaScript, PHP, Lua or Kotlin writes `function` by habit, and today gets E102 with no hint that `fn` was meant. `pub`/`public`, `mut`/`mutable` and `immut`/`immutable` already set the precedent: a short form for people who know the language and a full word for people who are reading it for the first time.

## Design

**2.3, contextual.** `function` is read as `fn` only where a function declaration can start:

- at the top level or inside a top-level `unsafe { }` block, after an optional `pub`/`public` or `extern`: `function add(a: int, b: int): int`, `pub function T.m(self: T)`, `extern function puts(s: string): int32`;
- followed by `<` for a generic function: `function<T> id(x: T): T`.

Anywhere else, including a function type (`fn(int): int`) and every expression, `function` is an ordinary identifier, so `immut function: int = 3;` compiles as it does today. The two spellings mean exactly the same; the formatter keeps whichever the author wrote.

**3.0, reserved.** The lexer reads `function` as `fn`, so it works everywhere `fn` does, function types included, and it is no longer an identifier. A program with a variable, parameter, field or function named `function` is migrated by renaming it (`turf migrate 3.0`); `lint-set = "3.0"` reports each such name in 2.x.

## Constitution check

- **I. Safe by default, unsafe by declaration.** Not affected.
- **II. Native performance, with costs you can read.** Not affected.
- **III. The compiler is the authority.** Not affected.
- **IV. Nothing crosses a boundary implicitly.** Not affected.
- **V. A few general mechanisms, not many special cases.** A synonym, not a mechanism. The cost is a second spelling, as with `pub`/`public` and `mut`/`mutable`.
- **VI. It works when you install it.** Not affected.
- **VII. Stability is a promise.** 2.3 is additive: a contextual keyword cannot change the parse of a program that compiled. Reserving the word waits for 3.0 and is migrated mechanically.
- **VIII. A claim is not true until it is demonstrated.** See Verification.

The Non-Goals hold: no borrow checker, no no-runtime targets, no AI in the compilation path.

## Migration

2.3: nothing breaks. 3.0: an identifier named `function` is renamed by `turf migrate 3.0`; until then `lint-set = "3.0"` lists them.

## Verification

- 2.3: each declaration form above compiles to the same program as its `fn` spelling (identical IR); `immut function: int = 3;`, a parameter and a field named `function` still compile; the 2.0 compatibility corpus passes unchanged.
- 3.0: `function(int): int` is a function type; an identifier named `function` is an error with a hint, and `turf migrate 3.0` renames it.

## Drawbacks

- Roadmap 4.1 asks for one spelling per idea; this adds a second. `pub`/`public` and `mut`/`mutable` are the precedent. `turf fmt` changes only whitespace (F-FMT-1), so it never rewrites one spelling into the other.
- Reserving a word in 3.0 breaks every program that uses it as a name.

## Alternatives

- **A hint only.** E102 on `function` could say "write `fn`". Cheaper, and worth doing either way; rejected as the whole answer because the owner asked for the spelling.
- **Reserve it in 2.3.** Rejected: a minor never adds a reserved word (roadmap 5.2).

## Unresolved questions

- Whether a lint (allow-by-default) should prefer one spelling within a project.
