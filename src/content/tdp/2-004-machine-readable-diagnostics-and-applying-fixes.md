---
major: 2
number: 4
title: Machine-readable diagnostics and applying fixes
description: Add a JSON form of every diagnostic, with its fix as data, and a command that applies only validated fixes on request.
status: accepted
date: 2026-10-15
authors:
  - Turf Team
---

## Summary

Tools that read the compiler's output today scrape text, and the text is explicitly not part of the compatibility promise. This proposal adds `--diagnostics=json`, a versioned, documented form of every diagnostic: code, severity, spans, hint, related locations and the fix as a list of edits. It then adds `turf fix`, which applies only fixes the compiler has validated, atomically and on explicit request. The JSON form lands first, in 2.1. The apply command follows in 2.7, once the fixes it applies exist.

## Motivation

Diagnostic text is allowed to change. The project has decided that message wording and ordering are outside the contract, because the compiler's wording has to improve. The contract is the diagnostic code and the exit status.

That leaves every consumer in a bad place:

- `turf-lsp` wants to offer a fix as a quick action. It has no data to build one from except the printed text.
- The `--smart` benchmark classifies each run by reading the compiler's output.
- Editors, CI annotations and the fuzzer each scrape the text in their own way, and each breaks when a hint is reworded.

A fix has the same problem in a sharper form. [TDP-2-001](/tdp/2-001/) (fixes in diagnostics without a model) prints a `Fix:` line for a person. A program cannot apply a line of text with confidence. It needs the span and the replacement.

## Design

### The JSON form

`turfc --diagnostics=json` (and `turf check --diagnostics=json`) prints one JSON document for the compile instead of the human text. The shape follows the SARIF idea of a result with locations, simplified:

```json
{
  "schema": "turf-diagnostics/1",
  "diagnostics": [
    {
      "code": "E040",
      "severity": "error",
      "message": "I can't find anything named 'nmae'.",
      "hint": "It may be from the current file: 'name'",
      "spans": [
        { "file": "main.tr", "line": 3, "column": 27, "length": 4, "primary": true }
      ],
      "related": [],
      "fixes": [
        {
          "description": "replace 'nmae' with 'name'",
          "edits": [
            { "file": "main.tr", "line": 3, "column": 27, "length": 4, "replacement": "name" }
          ]
        }
      ]
    }
  ]
}
```

The `schema` field names a published schema with fixture files. A producer may add fields in a minor release. It changes the meaning of a field only with a schema major. Consumers test against the fixtures, which is what stops the compiler and its tools from drifting apart.

Message and hint stay in the document for display, but a tool is expected to key on `code`, `spans` and `fixes`. The JSON form is a new flag, so it is additive and raises the driver's interface minor.

### Order of work

The JSON form lands **before** any change to default output. The `Fix:` lines of [TDP-2-001](/tdp/2-001/) (fixes in diagnostics without a model) then arrive in text that tools were already told not to parse.

### `turf fix`

`turf fix` applies fixes. It is deliberately narrow:

- It applies only a fix the compiler produced and validated by re-checking ([TDP-2-001](/tdp/2-001/), fixes in diagnostics without a model). It never applies a model's suggestion.
- It applies a fix only when the diagnostic offered exactly one.
- The edits are written atomically: all of them to a temporary copy, the result checked, and only then moved over the originals. If the re-check fails, no file changes.
- It has the same verified-result guarantee as `turf fmt`: the program after the edit compiles without the diagnostic it fixed.
- It does nothing without being asked. `turf check` and `turf build` never change a file.

```text
turf fix            # show what would change
turf fix --write    # apply the validated fixes
```

## Constitution check

- **I. Safe by default, unsafe by declaration.** A fix never introduces `unsafe`, and `turf fix` applies a fix only after the same checks pass on the edited program.
- **II. Native performance, with costs you can read.** Not affected for compiled programs. The JSON form is produced on the error path only.
- **III. The compiler is the authority.** This is the reason for the proposal. The compiler states its own result as data, so tools stop inferring it from prose.
- **IV. Nothing crosses a boundary implicitly.** `turf fix` writes files only on an explicit `--write`, and the check and build commands never write.
- **V. A few general mechanisms, not many special cases.** One document shape serves the editor, the benchmark and the fuzzer.
- **VI. It works when you install it.** The JSON form is part of the plain build. No model or extra download is involved.
- **VII. Stability is a promise.** The schema is versioned, and fields are added without changing existing meanings. Text output stays outside the contract, as decided.
- **VIII. A claim is not true until it is demonstrated.** Fixture files pin the schema, and `turf fix` re-checks before it writes.

The Non-Goals hold. This asks for no borrow checker and no no-runtime targets. No model is involved in producing or applying a fix.

## Migration

Nothing breaks. The default output is unchanged by the JSON flag, and `turf fix` is a new command. Tools that scrape text can move to the JSON form at their own pace.

## Verification

- Published schema and fixture files, with the compiler's CI running each consumer's fixture tests.
- A round-trip test: for every code that offers a fix, apply the JSON edits to the source, and confirm the program compiles without that diagnostic.
- A test that a failed re-check leaves every file untouched.
- A test that `turf fix` without `--write` changes nothing.
- The `--smart` benchmark reading JSON instead of text, with the same results.

## Drawbacks

- A public schema is a promise to keep. Adding fields is cheap, and changing a meaning needs a schema major.
- Two outputs (text and JSON) must stay in step. Both come from the same diagnostic object, so they cannot disagree about the facts.
- `turf fix` can only apply what the compiler is sure of, which is less than a person might hope for.

## Alternatives

- **Keep scraping text.** Rejected: it ties every tool to wording the compiler is meant to improve.
- **Use SARIF exactly.** Rejected as too heavy for the data needed, though the shape borrows from it and a converter is possible.
- **Apply fixes inside `turf build`.** Rejected: building should never edit source.

## Unresolved questions

- Whether to emit SARIF as a second format, or leave that to a converter.
- Whether the JSON form streams one diagnostic per line for large builds.
- How a multi-file edit is described when two fixes touch the same span.
- Whether `turf fix` accepts a single code, such as `turf fix --only E040`.
