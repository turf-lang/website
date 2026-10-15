---
major: 2
number: 12
title: Richer patterns and enum payloads
description: Make `compare` usable as an expression, add range and nested or-patterns, and let plain enums carry data.
status: proposed
date: 2026-10-15
authors:
  - Turf Team
---

## Summary

Turf's pattern matching is useful but narrow. A `compare` can only be a statement, patterns cannot match a range of values or nest an alternative inside another pattern, and an `enum` cannot carry data, so a value that is "one of several shapes, each with its own fields" needs a struct and a tag by hand. This proposal makes `compare` an expression, adds range patterns and nested or-patterns, and allows a plain `enum` variant to hold a payload, reusing the representation the language already has for tagged values.

## Motivation

A common shape is a value that is one of several kinds: a token that is a number or a word or a symbol, a result that carries a value or a message. Today the program defines a struct with a tag field and a set of fields of which only some are meaningful, then checks the tag everywhere. The compiler cannot see that a field is only valid for one tag, so a mistake is a wrong answer and not an error.

Smaller gaps compound it. A `compare` that picks a value must assign to a variable from each arm, because it cannot yield a value. Matching "any digit" means listing ten alternatives.

## Design

### `compare` as an expression

A `compare` may appear where a value is expected, and each arm yields a value.

```turf
immut label = compare score {
    0 => "none",
    1..9 => "few",
    10.. => "many",
};
```

All arms must have the same type, and the arms must cover every case, as a statement `compare` already must. A missing case is an error that names it.

### Range patterns and nested or-patterns

A range pattern matches every value in an interval. An or-pattern may appear inside another pattern, not only at its top.

```turf
compare ch {
    '0'..'9' => digit(),
    'a' | 'e' | 'i' | 'o' | 'u' => vowel(),
    _ => other(),
}
```

A nested or-pattern, such as `Point(0 | 1, y)`, matches when either alternative matches. Every alternative must bind the same names with the same types.

### Payloads on enums

A plain `enum` variant may carry data.

```turf
enum Shape {
    Circle(radius: double),
    Rectangle(width: double, height: double),
    Empty,
}

compare shape {
    Circle(r) => 3.14159 * r * r,
    Rectangle(w, h) => w * h,
    Empty => 0.0,
}
```

A variant's fields can be read only inside an arm that has matched that variant, so the compiler can see that a field is valid. The representation reuses the one already used for tagged values, so a variant without a payload costs what an enum costs today. An enum with no payloads is unchanged.

### Long-hand comparison

The `Shape` above replaces a struct with a `kind` field and three optional groups of fields, and the exhaustive `compare` replaces a chain of `if kind == …`. Both compile to a tag check and field loads, and the proposal's verification compares them.

## Constitution check

- **I. Safe by default, unsafe by declaration.** This makes a mistake the compiler can see. A payload is readable only after its variant is matched, and exhaustiveness is checked.
- **II. Native performance, with costs you can read.** A payload enum is a tag plus the largest variant, a layout a reader can predict. A match is a tag check.
- **III. The compiler is the authority.** The compiler checks exhaustiveness and binding consistency, and says which case is missing.
- **IV. Nothing crosses a boundary implicitly.** A payload enum is a new type with a documented layout. It does not cross into C unless the author declares it so.
- **V. A few general mechanisms, not many special cases.** One pattern language covers literals, ranges, alternatives and variants. Ranges and alternatives work in every pattern position.
- **VI. It works when you install it.** No dependency.
- **VII. Stability is a promise.** An existing enum is unchanged, and a variant without a payload keeps its representation. The new syntax is rejected today.
- **VIII. A claim is not true until it is demonstrated.** Tests compare the generated code with the long-hand struct form and check exhaustiveness errors.

The Non-Goals hold. This asks for no borrow checker and no no-runtime targets, and no model is involved.

## Migration

Nothing breaks. Existing enums and `compare` statements work as before. A program that uses a struct and a tag can move to a payload enum at its own pace.

## Verification

- Exhaustiveness tests for each new pattern form, including a missing range.
- A test that every alternative in an or-pattern binds the same names, and a rejection when not.
- Layout tests that an enum without payloads is unchanged.
- A comparison of the generated code for the long-hand struct and the payload enum.
- A test that a payload is not readable outside a matching arm.

## Drawbacks

- Patterns are a rich feature, and each form is more to document and to test.
- Exhaustiveness over ranges needs interval reasoning in the compiler.
- A payload enum is larger than a plain one, by the largest variant.

## Alternatives

- **Do nothing.** Keep the struct and tag. Rejected: it hides errors the compiler could find.
- **A separate `union` feature.** Rejected under Principle V: it is a second mechanism for the same job.
- **Classes and inheritance.** Out of scope, and a different design.

## Unresolved questions

- The exact spelling of ranges, including whether the end is included.
- Whether a variant may be used as a type on its own.
- How a payload enum is declared for use across the C boundary.
- Whether a guard (`if` condition) on an arm is included here.
