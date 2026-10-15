---
major: 2
number: 14
title: Circular imports
description: Allow two modules to import each other, so a program that is rejected today for a cycle compiles.
status: accepted
date: 2026-10-15
updated: 2026-10-16
authors:
  - Turf Team
---

## Summary

Today a module cannot import a module that imports it. Two files that naturally belong together, such as a parser and a syntax tree, must be merged or split along an artificial line. This proposal lets modules import each other. It is a change to the module system that only **accepts** programs rejected today, and it keeps every rule that makes a module's meaning predictable: names are resolved the same way, initialisation order is defined, and a cycle never causes a name to be read before it exists.

## Motivation

Real programs have mutual relationships. A `Tree` has `Node`s and a `Node` knows its `Tree`. A parser calls a function in the evaluator that calls back into the parser. When the language forbids a cycle, authors either put unrelated code in one large file or add a third module that holds only the shared declarations, and neither is a design choice. They are a workaround.

## Design

### What is allowed

A module may import another module that, directly or through others, imports it back.

```turf
// tree.tr
import node;
export struct Tree { root: &?node::Node; }

// node.tr
import tree;
export struct Node { owner: &?tree::Tree; value: int; }
```

Declarations are collected from every module in a cycle before any body is checked, so a type or function in one module can be named by the other regardless of the order in which they are read.

### What stays the same

- **Names resolve as they do now.** An imported name is reached through its module's name. A cycle adds no new lookup rule.
- **A module is checked once.** Cycles do not cause repeated work.
- **Constant initialisation is ordered by dependency.** A module-level constant that depends on a constant in another module is initialised after it. If constants depend on each other in a loop, that is an error that names the loop, because there is no valid order.
- **Types cannot contain themselves by value.** `Tree` holding a `Node` by value that holds a `Tree` by value is an infinite size and stays an error. A reference or collection breaks the loop.

### Diagnostics

An unresolvable cycle, such as the constant loop above, is reported with the full chain of modules, so the reader sees the path. The current "circular import" error is retired for the cases that now work.

## Constitution check

- **I. Safe by default, unsafe by declaration.** Not affected. A cycle cannot read an uninitialised value: a constant loop is an error and a value-containing type loop is an error.
- **II. Native performance, with costs you can read.** Not affected at run time. The compile-time cost of collecting declarations first is linear in the size of the cycle.
- **III. The compiler is the authority.** The compiler decides what a cycle means and reports the exact chain when it cannot be resolved.
- **IV. Nothing crosses a boundary implicitly.** An import is still written. A cycle exists only because both modules say so.
- **V. A few general mechanisms, not many special cases.** One rule, declare first and check later, applies to every module, with no special case for a cycle.
- **VI. It works when you install it.** No dependency.
- **VII. Stability is a promise.** The change accepts programs rejected today. No program that compiles changes meaning.
- **VIII. A claim is not true until it is demonstrated.** Tests cover accepted cycles and each unresolvable shape.

The Non-Goals hold. This asks for no borrow checker and no no-runtime targets, and no model is involved.

## Migration

Nothing breaks. A workaround module that exists only to avoid a cycle can be removed whenever the author likes.

## Verification

- A test of two modules importing each other, with types and functions used across the cycle.
- A test of a three-module cycle.
- Negative tests for a constant loop and for a type that contains itself by value, with the expected chain in the message.
- A test that a program with no cycle compiles to identical output as before.

## Drawbacks

- Cycles can make a program harder to read, because dependencies go both ways. The language allows them. Style guidance may discourage them.
- Compile order is less obvious, and incremental builds must treat a cycle as one unit.
- Separate compilation (a later proposal) must cache a cycle as a whole.

## Alternatives

- **Keep the restriction.** It is simple and it forces layering, but it rejects reasonable programs.
- **Forward declarations.** Rejected: they add syntax and a second place to keep in step with the definition.
- **Allow cycles only for types.** Rejected: functions that call each other across modules are as common.

## Unresolved questions

- Whether the standard library may use cycles internally.
- How a cycle appears in the package graph output.
- The exact order of module-level initialisation, to be fully specified in the reference.
