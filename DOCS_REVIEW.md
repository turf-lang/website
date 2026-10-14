# Docs review (batches)

A read-through of every generated Docs page (and a pass over Stdlib), looking for three things: **formatting** problems (indentation, broken lists, unhighlighted code), **weak spots** where a reader will stumble (undefined terms, concepts used before they are explained), and **gaps** in how the original text is presented.

How the fixes work: our own explanations live in `scripts/docs-insert/<area>/<page>.mdx`, each block placed right after a named heading (`{/* after: ## Heading */}`). They are always shown as a boxed "In plain words" / "Watch out" / "Tip" callout, so they are visibly ours and the original reference text is untouched. `node scripts/convert-docs.mjs` rebuilds everything. (Stdlib pages are edited directly; they are not regenerated.)

## Mechanical problems found and fixed

| Problem | Cause | Fix |
|---|---|---|
| Lists broke around code blocks (items renumbered, bullets split) | The converter pulled indented fences out to column 0 | Blocks inside a list keep the item's indentation (`emit()` in `convert-docs.mjs`) |
| Code not highlighted, especially in Migrating | The source uses ` ```text ` for Turf code that is not meant to compile (1.x examples); the site's Shiki grammar knew only 4 keywords | `classifyFence()` re-labels `text` fences that hold Turf code as `turf`; the grammar now uses the same full keyword/type list as the Learn tokenizer, plus chars, annotations, numbers with `_` |
| Compiler output and `$` sessions were plain grey text | Same `text` fences | Compiler output renders as `<Terminal diagnostic>` in the compiler's own colours; shell sessions as `<Terminal>` |
| Output shown twice under programs | The source repeats the output in its own fence | Dropped when it equals the captured output |
| Failing examples showed a shortened error, not the real one | Source shows an abbreviated message | The real `turf check` output is used; the abbreviation is dropped |
| GitHub-style `> [!NOTE]` and `> **Bold.**` blockquotes rendered as plain quotes | MDX has no alerts | Converted to Callouts |
| Links that wrap across lines (`[Memory and\nsafety](…)`) and reference-style link definitions were not rewritten | Links were rewritten line by line | Rewritten over the whole text |
| `E060` inside a longer code span (`turf explain E060`) produced broken markup | Error codes were linked inside code | Only a code alone in backticks, or bare, is linked |
| A poisoned cache made every error example fall back to plain code | Compiler failures with no output were cached | Not cached any more; the converter drops such entries on load |
| Section numbers `01 02…` clashed with the source's own numbered headings (`1. Functions`) | Learn styling | Hidden on Docs pages (`.docs-prose`) |
| `####` headings had no style | Not in the CSS | Added |
| Tables inside callouts overflowed | Cell min-width | Narrower cells inside callouts |
| 4 anchors in the source point at renamed headings | Source drift | Redirected by `staleAnchors` |
| `Note:` lines were grey | No blue colour token | `text-term-note` |
| Blog code highlighted poorly | The site grammar knew a short keyword list | The site now uses the editor grammar from turf-lsp (`scripts/sync-grammar.mjs`) |

## Batches

Each batch lists what a reader would stumble on and what was added. "Added" means a callout inserted after the heading named.

### Batch 1: Variables and Types, Operators
- *Stumbles:* `main`, `printline`, `return` appear before anything explains them; widening, narrowing, truncate, signed, byte, IEEE and overflow are never defined; `char` versus `string` quotes; `=` versus `==`; `/` on integers chopping the fraction; short-circuit; bit operations; `++` versus `++x`.
- *Added:* a "reading the programs" tip; plain-words boxes for definite assignment, primitive types (a glossary of the words above), `int32` ("do I need it?"), `char`, integer overflow (odometer), casting; on Operators: precedence ("use brackets"), `=` versus `==`, arithmetic, comparison, logical (short-circuit), bitwise (with a worked 12/10 table), compound assignment, `++`, `give` / `otherwise`.

### Batch 2: Control Flow, Error Handling
- *Stumbles:* the end of a range is excluded; counting down needs `step i--`; for-each works on arrays only; `defer` order and that a panic skips it; `compare` patterns (a bare name *compares* at the top level but *binds* inside a struct pattern); `!T` is not a `T`; what `recover` forms do; `return` inside `recover` leaves the *enclosing* function; payloads; `@caller_location`.
- *Added:* plain-words boxes for `if`, `while`, `do`/`while`, range `for` (with a table), for-each, `break`/`continue`, `defer`, `compare`, exhaustiveness; for errors: error types, payloads, `!T` (the sealed envelope), `recover` (three cards), the `return`-inside-`recover` warning, `try`, panics, `@caller_location`.

### Batch 3: Functions and Modules, Structs and Enums, State Machines
- *Stumbles:* by-value versus reference parameters (references appear here first); methods and `self`; overloading; UFCS; the three import forms (`import m;` gives `m::`, `import m::f;` gives bare `f`, not both); `::` versus `.`; the prelude; `pub` and private fields; the missing brace-literal for structs; struct copying; layout cycles; the three kinds of link (`&?T`, `&T`, `T*`); null checks; machine states and the two layers of checking.
- *Added:* a plain-words box for each section of Functions and Modules (including "copy or original?"), Structs ("coming from another language?", three kinds of link, "check for null first"), Enums, and State Machines.

### Batch 4: Generics and Operator Overloading, Arrays
- *Stumbles:* what `T` means; that type arguments are never written at a call (`Box<int>::default()` does not parse); no constraints, errors appear per use; `==` does not give `!=`; negative indices; slices are views, not copies; **`T[N]` (a copy) versus `T[]` (shares the caller's array)**; where the brackets go in `(&T)[N]`; "escape" and frames.
- *Added:* plain-words boxes for generics, generic functions, "you never write the type at a call", what a body can do with `T`, reading generic errors, operator overloading; for arrays: declaring, multidimensional, initialisation, indexing (with a table), bounds checking, a table for the two kinds of array parameter, slices, `copy()`, arrays of references, escape rules.

### Batch 5: Memory and Safety, FFI and unsafe — **pointers**
- *Stumbles:* the reader meets `&T`, `&?T`, `T*`, `ptr` and `void*` across four pages and never in one place (the only comparison was section 10 of the FFI page); "heap", "frame", "dangling" and "escape" are not explained; assigning a collection *shares* it; `unsafe` is mistaken for "checks off"; C `int` is `int32`.
- *Added:* a **"four pointer-like types at a glance"** table at the start of the references section (and again at the start of the pointer compiler page and in the FFI page), a three-places-for-data box (desk, warehouse, poster), "copying a collection shares it", `heap(x)`, escape rules (dangling references), checks that panic, the guarantee list, the manual heap; for FFI: `extern fn`, the C `int` warning, "ptr, T\*, &T: what is the difference?", `unsafe { }` as a permission slip, `unsafe module;`, converting, callbacks.

### Batch 6: Tooling (CLI and Diagnostics, Projects and Packages) and Guides
- *Stumbles:* `turf` versus `turfc`; what a flag, optimisation, exit status, static analysis and "panic exit 134" mean; how to *read* a diagnostic; program versus library; manifests; dependencies (path, git, tag, rev, branch); `turf.lock`; `--locked` versus `--offline`; CI; "release" is not a mode; what an API is; tags as releases.
- *Added:* plain-words boxes for each of those, on all five pages.

### Batch 7: Migrating to 2.0
- *Stumbles:* the highlighting problem (see above); no explanation of how an entry is laid out.
- *Added:* a "how to use this guide" box (Old / New / Fix / Tool) and the highlighting fix.

### Batch 8: How the compiler works (8 pages)
- *Stumbles:* the pipeline page assumes the reader knows lexer, parser, pass, token, AST.
- *Added:* a terms box on the pipeline page and a plain-words box for each stage (lexer, parser, resolver, type checker, codegen, CFG analysis, monomorphization, front end), a Part 1 / Part 2 explanation on the modules, memory-model, pointers and errors pages, and the pointer table.

### Batch 9: Standard library (12 pages)
- *Stumbles:* a string is bytes (`"héllo".length()` is 6); `parse_int` versus `s to int`; what a comparator, a hash and big-O notation are; collections share on assignment; for-each on collections; what stdout/stderr, buffering, TCP and a port are; `get` versus `has`; what a route is.
- *Added:* a plain-words box for each, plus error codes linked to their pages, API signature blocks highlighted as Turf, shell sessions as Terminals, and the "Not for security" quote turned into a warning callout.

## Not fixed
- The **reference text itself** is unchanged and still dense in the deepest sections (monomorphization limits, `T[]` escape rules, `mem::root`). The boxes above make each section approachable but do not rewrite it.
- The **compiler pages** are for contributors. They now have a ramp, but a reader with no C++ will still skim the implementation parts.
- Source-repo errors, reported as turf-lang/turf-lang#276, #277 and #278 and worked around by the converter.
