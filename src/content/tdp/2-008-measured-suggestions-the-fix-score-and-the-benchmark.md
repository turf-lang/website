---
major: 2
number: 8
title: "Measured suggestions: the Fix Score and the benchmark"
description: Replace the binary confidence of model suggestions with a decomposed, calibrated score, and measure the assistant against a larger benchmark with a rules-only baseline.
status: accepted
date: 2026-10-15
authors:
  - Turf Team
---

## Summary

`--smart` can suggest a fix with the help of a language model. Today its confidence is effectively binary, its benchmark is 22 cases read by scraping text, and nothing says whether a change to the prompt or the model made things better. This proposal makes the assistant's trustworthiness something that is measured. It adds a provenance label to every suggestion, a decomposed Fix Score with tiers (`proven`, `verified`, `plausible`), a benchmark with a utility score and confidence intervals, a larger corpus with a held-out split, checks on the model and on what a suggestion does, richer prompt context, and hint backfill for diagnostics that have none. The model never enters the compilation path, and a suggestion is still only shown, never applied.

## Motivation

What exists today, as read from the compiler on 2026-10-15:

- `--smart` first tries a rule-based rename fix for 11 error classes, then a cache, then a grammar-constrained model. Every candidate is re-checked in a sandbox (lex, parse, resolve, type-check, lint; never code generation) before it can be shown.
- The rule layer already works with no model, but it still needs the flag and labels its result as an AI suggestion even though no model ran.
- Confidence is almost a boolean. A sandbox-validated fix scores at least 0.9, anything else at most 0.5. A fix that **deletes** the failing statement passes the sandbox as happily as a real fix.
- The benchmark has 22 cases and reports eight numbers with no single verdict. It needs the real model, runs by hand, and classifies outcomes by reading stdout.

A suggestion that a person trusts and that is wrong is worse than no suggestion. The current setup cannot tell us how often that happens.

## Design

### Provenance

Every suggestion carries one of three origins: `rule`, `model` or `cache`. Output says `Compiler fix` for a rule and `Model suggestion` for a model, and never says `[AI Suggestion]` for something no model produced.

### Fix Score v2

The score becomes a set of facts the compiler computes deterministically after the sandbox run, shown as a short checklist and reduced to a tier.

| Fact | How it is computed | Effect |
|---|---|---|
| Valid | the original diagnostic is gone and no new error appears | Hard gate. An invalid fix is never shown. |
| Warning delta | diagnostic codes after minus before | A new warning lowers the tier. |
| Minimality | token-level edit distance and lines touched | A wide edit lowers the tier. |
| Semantic loss | calls, `assert`s, `return`s or assignments removed | A net loss caps the tier at `plausible`. Catches "fix by deletion". |
| Surface stability | function signatures, struct layouts and `pub` items outside the edit | A change caps the tier at `plausible`. |
| Capability diff | see below | A new capability forces `plausible`, with the reason stated. |
| Ambiguity | number of distinct validated candidates | Disagreement lowers the tier. |
| Provenance | rule, model, or cached model | A unique valid rule fix is `proven`. |

The tiers are **`proven`** (a unique valid rule fix with no flags), **`verified`** (a valid model fix with every other fact clean), **`plausible`** (valid but flagged, shown with the flag spelled out) and **rejected** (never shown). The display gate becomes a tier policy instead of a 0.8 threshold. Calibration is reported: for each tier, the rate of semantically correct fixes on the held-out split. If `verified` is not measurably more reliable than `plausible`, the tiers are wrong.

### Checks on what a suggestion does

The sandbox proves a fix compiles, not that it kept the program's meaning. These checks are conservative: they only lower a tier and never reject on their own.

- **Capability diff.** The edit adds `unsafe`, `extern`, a new import of `os`, `fs`, `http` or `io`, a raw pointer, or `mem::` calls.
- **Deletion.** The edit removes more code than it adds.
- **API surface.** A signature, layout or `pub` item outside the edited span changed.
- **Warning delta.** New warnings, including the analysis family of [TDP-2-007](/tdp/2-007/) (analysis warnings).
- **Code generation recheck (optional).** Compile to an in-memory module and run the LLVM verifier, without linking or running anything. A suggestion is never executed by the compiler. Only the benchmark runs patched programs.

### Benchmark scoring

- **Utility per case.** `+1` for a shown fix that is correct, `0` for nothing shown, `−K` for a shown fix that is wrong or does not recompile, with `K = 3` as the default. Mean utility is the headline, with a bootstrap 95% confidence interval. A change counts as an improvement only if the intervals separate.
- **Rules-only baseline.** The same corpus with the model off. What the model adds is `utility(model) − utility(rules)`. If that is not positive after latency, the large download is not earning its place.
- **Calibration and abstention.** Reliability by tier, and the rate of correct silence on cases where nothing should be suggested.
- **Cost.** Median and 95th-percentile latency and peak memory per path.
- **Machine-read results.** Outcomes come from the JSON diagnostics of [TDP-2-004](/tdp/2-004/) (machine-readable diagnostics and applying fixes), not from stdout, and one JSON record per run is stored so a trend across commits is visible.

### The corpus

Grow from 22 cases to several hundred by generating them from the passing tests with the existing mutators, one per error code the suite exercises. Split train and held-out **by source test file**, so tuning never sees the held-out set. Add hard negatives (use before declaration, two equally good renames, a diagnostic that needs a design decision), multi-error files, and programs from the examples and the showcase.

### Checks on the model

None needs the network.

| Check | What it does |
|---|---|
| Qualification | A script runs the benchmark on a model file and records its hash, utility, false-confidence rate, latency and memory. `--smart` prints one note if the loaded model is not on the qualified list, and never blocks. |
| Determinism | Fixed seed and temperature 0, with a CI check that the same input gives the same output twice with the cache bypassed. |
| Drift | An optional scheduled job reruns the benchmark and fails on a utility drop outside the interval. |
| Output conformance | Counts of grammar escapes, parse failures, splice failures and empty answers. A rise is a harness regression. |
| Resource bounds | A wall-clock budget for the whole run, a memory check before loading, and a token cap. It fails closed to the compiler's own diagnostics. |
| Prompt injection | A fixed set of hostile-source cases is part of the replay suite, with the capability diff as the backstop. |

### Richer prompt context

The prompt carries known types for one call site today. Add the declaration of each struct a diagnostic names, the signature of a called function, and the enclosing function's parameter types.

### Hint backfill

Of the diagnostics exercised by the compiler's tests, 20 print only general advice and 5 print no hint (E105, E106, E115, E116, E118). A fix builds on a concrete hint, so these are written first.

## Constitution check

- **I. Safe by default, unsafe by declaration.** The capability diff exists to catch a suggestion that adds `unsafe` or a raw pointer, and lowers its tier. A suggestion is never applied.
- **II. Native performance, with costs you can read.** Not affected for compiled programs. The assistant's own cost, latency and memory, is measured and published.
- **III. The compiler is the authority.** The sandbox re-check stays the hard gate, and every fact in the score is computed by the compiler. A model's opinion of itself is never used.
- **IV. Nothing crosses a boundary implicitly.** A suggestion is shown, never applied. The model is a separate, optional download chosen by the user.
- **V. A few general mechanisms, not many special cases.** One score, one tier policy, one benchmark. A new error class does not add a new rule to the scorer.
- **VI. It works when you install it.** The compiler's own fixes work in every build. The model path stays optional and says plainly when it is not qualified.
- **VII. Stability is a promise.** Suggestion text and labels are output, outside the compatibility promise, and machine consumers read JSON.
- **VIII. A claim is not true until it is demonstrated.** This entire proposal is about demonstrating the claim "the suggestion is trustworthy", with a held-out split, intervals and calibration.

The Non-Goals hold. No model enters the compilation path: it is only on request and only suggests. The proposal asks for no borrow checker and no no-runtime targets.

## Migration

Nothing breaks. Output labels change from `[AI Suggestion]` to `Compiler fix` or `Model suggestion`, which is outside the compatibility promise. Existing flags keep their meaning.

## Verification

- The benchmark and its scoreboard are the verification, run on every change to the assistant and recorded.
- A model-free replay suite on every push, as now, extended with the hostile-source cases.
- A test that a fix by deletion is capped at `plausible`.
- Held-out calibration reported per tier.
- A check that the rules-only baseline runs in a build with no model at all.

## Drawbacks

- A larger corpus and a scoreboard are real maintenance work.
- Tiers add vocabulary a user must learn. The checklist keeps the reasons visible.
- Utility depends on the choice of `K`. It is documented, and the intervals show how sensitive the result is.

## Alternatives

- **Keep the binary score.** Rejected: it cannot tell a real fix from a deletion.
- **Trust the model's own confidence.** Rejected: it is not calibrated against anything.
- **Drop the model.** Possible if the baseline comparison says it does not earn its place. This proposal builds the measurement that would show it.

## Unresolved questions

- The thresholds for a model to count as qualified.
- Whether the tier shown to a user is a word, a mark, or both.
- The weight, if any, of each fact beyond the hard gate and the caps.
- Where benchmark results are stored and for how long.
