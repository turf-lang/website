---
major: 2 # the major version line the proposal first ships in
number: 3 # next unused number within that major, no gaps; the URL becomes /tdp/2-003/
title: Proposal title in sentence case
description: One sentence stating what the proposal changes.
status: draft # draft | proposed | accepted | implemented | rejected | withdrawn
date: 2026-01-01 # YYYY-MM-DD, when the proposal was first written
updated: 2026-01-15 # YYYY-MM-DD, optional; remove if never revised
authors: # one or more names
  - Your Name
discussion: https://example.com/discussion # optional full URL of the discussion thread; remove if none
---

## Summary

One paragraph describing the change, so a reader can decide whether to continue.

## Motivation

The problem. Who is affected, and what is hard or impossible today?

## Design

The change itself, with examples and edge cases.

## Constitution check

Every proposal obeys the Constitution. Say how, principle by principle. Write "Not affected" where a principle does not apply, and never leave one out.

- **I. Safe by default, unsafe by declaration.** How this proposal obeys it.
- **II. Native performance, with costs you can read.** How this proposal obeys it.
- **III. The compiler is the authority.** How this proposal obeys it.
- **IV. Nothing crosses a boundary implicitly.** How this proposal obeys it.
- **V. A few general mechanisms, not many special cases.** How this proposal obeys it.
- **VI. It works when you install it.** How this proposal obeys it.
- **VII. Stability is a promise.** How this proposal obeys it.
- **VIII. A claim is not true until it is demonstrated.** How this proposal obeys it.

The Non-Goals hold too. Confirm the proposal asks for none of them: no borrow checker, no no-runtime embedded targets, no AI in the compilation path.

## Migration

What breaks for existing code, and the path for moving it. Write "Nothing breaks" if so (Principle VII).

## Verification

Which tests, sanitizers or real programs will show the change does what it claims (Principle VIII).

## Drawbacks

What this costs: complexity, churn, performance or surprise.

## Alternatives

Other designs considered and why this one was chosen. Include doing nothing.

## Unresolved questions

What is still undecided and should be settled before acceptance.
