# Findings (temporary)

Open items. Delete this file once they are handled.

1. `verify-learn.mjs` needs `TURF_HOME` set. Without it, every check fails with the compiler error "Could not find module 'int'".
2. Doc examples that are fragments stay fragments (`<Code>`). Only fragments that demonstrate an error are wrapped in `fn main` so the real diagnostic can be shown (the same wrapping the language repo's CI uses).
3. Programs that panic, read input, open sockets or depend on time/randomness are `<Code>` (no output box), because they cannot be verified by output. Time examples that print wall-clock numbers are in this group.
4. Stdlib reference sections (memory, HTTP internals, hashing rules) are still the original technical text; only the intro boxes are written for beginners. Decided: not rewritten wholesale; the source text stays as the reference and the boxes carry the plain-words layer.
5. The Stdlib pages are hand-edited, not generated. If the stdlib source changes they need updating by hand.
6. The ` ```text ` fences in the source docs are classified by guessing (`classifyFence`). Source repo issue: turf-lang/turf-lang#278.
7. Source repo docs errors, worked around by the converter: turf-lang/turf-lang#276 and #277.
8. The `ContentArticle` header (blog posts) is still centered; only the TDP Process header was changed to left-aligned.
