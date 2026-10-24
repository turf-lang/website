---
major: 2
number: 27
title: Struct layout chosen by the compiler
description: "The compiler orders a struct's fields to waste no padding; a struct whose memory C reads says `@layout(c)` and keeps declaration order. Opt-in and warn-first in 2.7, the default in 3.0."
status: draft
date: 2026-10-25
authors:
  - Turf Team
---

## Summary

A struct today is laid out in declaration order, as C lays it out, so every field followed by a field with stricter alignment leaves a gap. This proposal lets the compiler choose the order: fields are placed by decreasing alignment, in declaration order among equals, which removes most padding. A struct whose memory C reads or writes is marked `@layout(c)` and keeps declaration order exactly. 2.7 adds the annotation, an opt-in `--struct-layout=compact`, a layout report, and a warning on any struct whose address reaches C without the annotation. 3.0 makes `compact` the default (breaking-change entry B-22).

## Motivation

Memory a program does not use still costs it: a `List<Particle>` of a million elements, a cache line that holds two structs instead of three, a copy of a struct passed by value. Padding is that kind of waste, and the programmer who wrote the fields in the order that reads best pays for it.

```turf
struct Particle { alive: bool, x: double, tag: char, y: double, hits: int32 }
```

`sizeof(Particle)` is 40 today: 7 bytes of padding after `alive`, 7 after `tag`, 4 at the end. The same fields placed by alignment (`x`, `y`, `hits`, `alive`, `tag`) take 24, 40% less, with no change to any line that uses the struct. `tests/05_arrays_pointers_ffi/24_padded_struct_sizes_use_target_layout.tr`'s `{ a: bool, n: int, b: bool[4] }` goes from 24 to 16.

Turf promises speed and memory safety by default. Asking every programmer to hand-sort fields for the first is a cost the compiler can carry, and it costs the compiler almost nothing: one sort per struct.

Other languages made the same choice. Rust reorders by default and keeps C order under `#[repr(C)]`. Zig leaves a plain `struct`'s layout unspecified and keeps C order for `extern struct`. HotSpot reorders Java fields. Go, C, C++ and Swift keep declaration order; Go ships a `fieldalignment` check that suggests a better one, which is this proposal's 2.x half.

## Design

### The rule

A struct without `@layout(c)` is laid out in **compact** order:

1. Fields are sorted by alignment, largest first.
2. Fields with equal alignment keep their declaration order.
3. Padding is inserted only where the next field's alignment requires it, and at the end to round the size up to the struct's alignment, as today.

A field's alignment is its type's: 8 for `int`, `double` and every pointer, reference and `string`; 4 for `int32`; 1 for `bool` and `char`; an array `T[N]` has `T`'s; a struct field has the largest alignment among its own fields. The rule reads only the struct's declaration, so every compilation unit computes the same layout (F-7a, separate compilation). A generic struct is laid out per instance after monomorphization: `Pair<bool, int>` and `Pair<int, int>` are each compact.

The rule is one sentence a reader can apply by hand, and `sizeof(T)` and the layout report (below) show the result, so a struct's cost stays readable from its source (Principle II).

### What the layout does not change

Only the bytes move. Everything a program can observe through safe code keeps declaration order:

- A struct literal evaluates its field initializers in source order.
- `==` and `hash_of` compare and hash field by field; neither reads padding.
- Debug information records each field's real offset, so a debugger shows the fields by name.
- The collector's per-type pointer bitmaps come from the compiler's layout, whatever it is.

What can see the order is code that reads a struct as bytes: C through `extern fn`, and `unsafe` code that converts `&s` to `ptr`, `T*` or `char*` and reads by offset. That is what `@layout(c)` is for.

### `@layout(c)`

```turf
@layout(c)
struct Timespec {
    sec: int,
    nsec: int
}

extern fn clock_gettime(clock: int32, ts: Timespec*): int32;
```

- A `@layout(c)` struct keeps declaration order and C's padding rules: the layout every struct has today.
- A `@layout(c)` struct's by-value struct fields must be `@layout(c)` too, since C sees their bytes as well. A field that is not is an error with a `Fix:` that adds the annotation to the field's struct, when that struct is in the same package.
- A generic `@layout(c)` struct applies the rule per instance: `Box<Point>` is an error if `Point` is not `@layout(c)`.
- `@layout` goes through the annotation mechanism `@ffi` and `@ownership` already use: an annotation on a declaration that cannot carry it, or an argument other than `c`, is `E146`, with a "Did you mean" suggestion.

### 2.7: opt-in, report, warning

- **`@layout(c)`** is accepted. In 2.x every struct is already in C order, so the annotation changes nothing about the program; it records an intent the compiler checks.
- **`turfc --struct-layout=declared|compact`**, default `declared`, and `turf build`/`run`/`test --struct-layout=compact`. A program can take the smaller layouts in 2.7. Its `@layout(c)` structs stay in C order either way. `TurfcInterfaceMinor` rises by one.
- **The layout report.** `turf layout [file]` prints, for each struct, its size and alignment in both layouts and each field's offset, and marks the ones `compact` shrinks. It reads `turfc --layout-report`, a JSON document with a versioned schema beside the diagnostics one (IF-2), so `turf-lsp` can show a struct's size on hover.
- **The warning.** A struct without `@layout(c)` whose address reaches C gets a warning, coded through the V-5 registry and controlled by V-1's levels, with a `Fix:` that inserts `@layout(c)` above the declaration. "Reaches C" means any of:
  - `&s`, `&s.f`, `&a[i]` or an array of the struct is an argument to an `extern fn`;
  - a reference to the struct is converted with `to` to `ptr`, `void*` or a pointer to another type;
  - the struct is a parameter or return type of a function value passed to an `extern fn` (a callback);
  - the struct is a by-value field of a struct that reaches C.

  The warning fires whether or not `compact` would move a field. A struct shared with C should say so, and a field added later must not silently change what C sees.

### 2.11: migration

`lint-set = "3.0"` reports the warning as an error, and `turf migrate 3.0` adds `@layout(c)` everywhere the warning fires.

### 3.0: compact by default (B-22)

`--struct-layout` defaults to `compact`. The warning becomes an error, so a struct the compiler can see crossing to C without `@layout(c)` does not compile; it is never silently reordered under C. `--struct-layout=declared` stays, so a layout bug can be bisected; it is a whole-program switch, not a substitute for `@layout(c)`.

## Constitution check

- **I. Safe by default, unsafe by declaration.** Safe code cannot observe field order, so safe code is unaffected. The places that can (C and byte-level `unsafe` code) are where the warning, and in 3.0 the error, apply. The gap (below) is in code that has already declared `unsafe`.
- **II. Native performance, with costs you can read.** This is the point of the proposal: less memory and more structs per cache line by default. The rule fits in one sentence, `sizeof` reports the result, and `turf layout` shows every offset. The memory saving is measured before acceptance (Verification).
- **III. The compiler is the authority.** The layout is a deterministic function of the declaration. The warning, the error and the `Fix:` are the compiler's, with stable codes.
- **IV. Nothing crosses a boundary implicitly.** A struct that crosses to C says so on its declaration, where a reader looks. Today a struct crosses silently.
- **V. A few general mechanisms, not many special cases.** One rule for every struct, the stdlib's included; `@layout` uses the existing annotation mechanism. No type is special-cased.
- **VI. It works when you install it.** No configuration: the layout is right by default, and the report ships in `turf`.
- **VII. Stability is a promise.** Additive in 2.7: an opt-in flag and an annotation that changes nothing. The default changes only in 3.0, after the warning has been in the field for two minors, with a mechanical migration.
- **VIII. A claim is not true until it is demonstrated.** See Verification: the whole test suite runs in both layouts from 2.7, and the memory saving is measured, not asserted.

The Non-Goals hold: no borrow checker, no no-runtime targets, no AI in the compilation path.

## Migration

Code that never hands a struct's memory to C changes in nothing but size. Code that does adds `@layout(c)` to each such struct; the 2.7 warning's `Fix:` and `turf migrate 3.0` write it. A test that asserts a struct's `sizeof` asserts the new size, or marks the struct `@layout(c)` if the size is what it is testing.

## Verification

- **The suite in both layouts.** From 2.7, CI runs the full test suite, `TURF_GC_STRESS` and the ASan build with `--struct-layout=compact` as well as `declared`. Every test that does not assert a size passes in both.
- **Layout unit tests.** For each field type and each combination of alignments: the computed offsets, size and alignment; the same struct laid out the same in two compilation units; a generic struct per instance; nested structs; `T[N]` fields.
- **The order-preservation tests.** Field initializers with side effects run in source order; `==`, `hash_of` and `-g` field names are identical in both layouts.
- **C round trips.** A `@layout(c)` struct written by C and read by Turf, and the reverse, in both layouts, against a C compiler's `offsetof` for each field.
- **The warning.** Each "reaches C" path fires it; a struct used only in safe code does not; the `Fix:` is checked like every DX-1 fix.
- **The measurement.** Before acceptance, `turf layout` over the test corpus, the examples and `turf-fuzz`'s corpus reports how many structs shrink and by how much, and `BENCHMARKS.md` records a struct-heavy benchmark (a `List` of a padded struct, iterated) in both layouts. If the saving is negligible, the proposal is withdrawn.

## Drawbacks

- **A gap the compiler cannot close.** A struct's bytes copied into `mem::alloc` memory and handed to C as an `int`, or a pointer laundered through C and back, reach C without any of the four paths above. Both need `unsafe`, so they are the programmer's responsibility under Principle I, and the reference documents the rule plainly: if C reads it, mark it.
- **`sizeof` changes in 3.0** for most structs. Code that hard-codes a size (rather than writing `sizeof(T)`) breaks. The compatibility corpus and the 3.0 migration guide list it.
- **A hand-tuned order is overridden.** A programmer who put two hot fields together on purpose loses that adjacency. `@layout(c)` restores declaration order. A dedicated `@layout(declared)` is left for when someone needs it (Unresolved questions).

## Alternatives

- **`extern struct`**, as Zig spells it. Rejected: `extern` introduces a declaration whose symbol C defines (`extern fn`), and a reader would take `extern struct` for an opaque C type. `@layout(c)` names what changes, and leaves room for other layouts without a new keyword.
- **Reorder only structs that provably never reach C**, with no annotation. Rejected: whether a struct reaches C depends on every module that uses it, which separate compilation (F-7a) cannot see, and an edit in one module would silently change a struct's layout in another.
- **Pack `bool` fields into bits.** Rejected for the default: a field can be borrowed (`&s.flag`), and a reference cannot point at a bit. A future `@layout(packed)` with unaddressable fields could offer it.
- **Keep declaration order and ship only the warning**, as Go's `fieldalignment` does. Rejected: it leaves the cost on every programmer by default, the opposite of "speed by default".
- **Do nothing.** Every struct keeps its padding.

## Unresolved questions

- Whether `@layout(declared)` (declaration order, no C interop claim, no nested-field rule) is worth a second spelling, or `@layout(c)` covers every case.
- Whether 3.0 should drop `--struct-layout=declared`, once the corpus has run compact for a full major.
- Related layout work that is not observable outside `sizeof` (the smallest discriminant for an enum, a `&?T` niche inside an optional or error payload) needs a change record, not a TDP, and is not part of this proposal.
