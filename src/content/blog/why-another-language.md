---
title: Why another language?
description: We started as a research project and ended up as a fully programmable systems programming language. This is the question we set out to answer, the bets we made along the way, and what we still don't know.
date: 2026-10-15
author: Aayush Shukla
github: a2ys
---

There are already a lot of programming languages, and many of them are very good. So why build another one?

The honest answer is that we didn't start out wanting new syntax. We started with a question, and we needed a language to answer it in. The question is this: if a compiler explains its errors really well, how much faster can people build software? And how much further can an AI model take that, without ever being trusted to decide whether your program is correct?

Turf is the language we built to answer that question with measurements instead of guesses. Along the way it also became a language you can actually use. This post covers the question, the choices we made, the things we gave up, and the things we still don't know.

## The question behind the language

Think about how you spend your time when you program. Not much of it goes on typing. Most of it goes on a loop you already know well: you write something, it breaks, you read the error, you try to understand it, you fix it, and you start again.

A language can make that loop short or long. A big part of the difference is the compiler's error messages, because you read them at the exact moment you are stuck.

So we asked three questions, in this order. First, how much of the loop can the compiler remove by itself? It can point to the exact spot, give each error a stable code, explain what went wrong, and, when there is only one right answer, write the fix for you. Second, of what is left, how much can a small AI model remove? We mean one that runs on your own computer, works offline, and is one you chose. Third, what does it cost in trust? If the model is wrong, who notices, and when?

We built Turf so that each of these questions has a number as its answer. Everything else in this post follows from that.

## The trade-off most languages make

Before we could ask any of this, we wanted a language that didn't force an unfair choice on us. Every popular language pays a price for what it is good at.

C is fast because it trusts you completely. The price is memory safety: one wrong pointer and your program can wreck itself. Rust is safe and fast because its type system keeps track of who owns every piece of memory. The price is effort, because you have to learn ownership and lifetimes before you feel productive. Go is simple because it has a runtime and a small set of features. The price is that it isn't meant for the same low-level, native-speed work.

None of these is a mistake. They are different answers to the same question: what are you willing to give up? Turf tries to get four things that are usually traded against each other. It wants fast programs, an easy start, errors that teach you something, and enough power that you build things in the language and not around it. The next five sections are our five bets on how to get there.

## Bet 1: safety without learning ownership

Safe Turf code cannot corrupt memory, and you never write a lifetime or a borrow annotation to get that. The runtime does the work for you. It has a garbage-collected heap, which means it cleans up memory you no longer use. It also checks integer math, so if a number grows too big the program stops with an error instead of quietly wrapping around to a wrong answer.

References come in two kinds, and the compiler won't let you mix them up. `&T` can never be null. `&?T` might be. You can only read through a `&?T` in a place where Turf has proved the value is really there:

```turf
struct Box { val: int }

fn bad(b: &?Box): int {
    return b.val;
}
```

```text
── error at line 4, col 13 [E081 · memory error]

  Possible null dereference: 'b' might be 'null' here, but you're accessing its 'val' field.
  Note: declared here (line 3, col 8)

  Hint: Add a null check first, e.g. 'if (b != null) { ... }', and access '.val' only inside it.

  4 │     return b.val;
    │             ^ Here!

  Run `turf --explain E081` for more details.
```

This is the kind of help we want everywhere. The message says what is wrong in plain words, shows exactly where, suggests a fix, and tells you where to read more. If you ever need raw pointers or C code, you write `unsafe`, and that code stays easy to spot because it is marked right where you use it.

This bet has a real cost, and we would rather say so. Turf has a runtime and a garbage collector, so it doesn't fit places that can't have one. It also will not give you the compile-time guarantees that Rust does.

## Bet 2: error messages are something we design

If error messages are what a programmer reads most while fixing a mistake, they deserve as much care as the language itself.

Every error in Turf has a stable code and a written explanation, and you can read it with `turf explain E081`. There are 149 codes today. Our tests also check the reason a program fails, not only that it fails. A bad program has to produce the exact error it was written to produce. If a test fails for the wrong reason, the whole test suite fails, and any known gaps go on a list instead of being hidden.

Failure is a normal value in Turf. A function that can fail returns `!T`. You either handle it with `recover` or pass it up with `try`, so there is never a secret way out of a function.

Everything comes in one toolchain. The `turf` command can create a project, build it, run it, test it, format it, check it, and explain its errors. A release is a single archive for Linux (x86-64 and arm64), Windows, and macOS on Apple Silicon. The compiler, linker, and runtime are all inside it.

We have measured how far along this is. We ran the compiler on its own 771 test programs that are written to fail. Together they trigger 136 of the 149 codes. For 111 of those codes, the hint names something specific, like a variable, a keyword, or a piece of code to type. Only 20 give general advice, and 5 give no hint. So most of the way to "tell the programmer exactly what to type" is done. What is left is turning that sentence into an actual edit.

One thing we want to be clear about: we believe all of this makes people faster, but we haven't run a user study, so we haven't measured it. What we can measure today is smaller but more useful for the research. For each kind of mistake, what does the compiler offer, how often is the offer right, and how long does it take?

## Bet 3: fast programs, with numbers

Turf compiles ahead of time to native code using LLVM. We want speed to be something we measure, not something we claim.

Our benchmark folder has six files. Five are Turf programs: a number-crunching loop over an array of structs, string handling, a map with keys constantly added and removed, lots of allocation for the garbage collector, and a JSON round trip. The sixth is the same number-crunching loop written in C. Each program prints a checksum that must stay the same on every run, and the C version must print the same one as the Turf version. If a benchmark gets more than 20% slower between a release candidate and its baseline, we have to write down why. A slowdown nobody can explain is treated as a bug.

The headline number comes from the number-crunching loop, the one with the C twin. Every `+` in it is checked for overflow. On our baseline machine it takes about 1.06 times as long as the same program in C built with `clang -O3`.

That number needs some caution. It is one program on one machine, and it doesn't mean checked math is free everywhere. We once measured a different program that was 53% slower than C. We had to rebuild it from its description, because the original was never saved in the repository. There, the overflow check on every addition stopped LLVM from vectorizing the loop, which means it couldn't process several numbers at once. We still count this as an open problem, and we have a design proposal for it. We would rather show you that than only show the friendlier number.

Measuring was harder than we expected. On a laptop under WSL, running the same code twice in a row could differ by as much as 30%. That is bigger than our 20% limit, so it would have raised alarms over changes that never happened. We fixed it with three things: pin each run to one CPU, interleave the benchmarks, and compare the fastest times instead of the middle ones. That brought the noise under 10%. The table, the noise measurements, and what each program tests are in `docs/development/BENCHMARKS.md` in the compiler repository. We publish them so anyone can run the same script and check our work.

## Bet 4: powerful without magic

When we say "programmable," we don't mean macros. Turf has none on purpose, and it has no compile-time code execution for users either. We mean something simpler: you can build in Turf anything the authors of the language can build.

The standard library gets no special treatment. Strings, collections, and operators are made from the same tools you have. Those tools are real generics, where each use is compiled into its own fast version, operator overloading for your own types, and `machine` declarations, which describe which state changes are allowed. If the compiler ever treats one particular type specially, we call that a defect and fix it.

The compiler also learns from declarations, never from names. If a function allocates memory or wraps C code, an annotation says so. Your own allocator is understood the same way the standard library's is.

Lastly, the compiler is a library. Calling `turf::analyze()` runs the front end on some source code and answers questions about the result. The language server and the AI helper below both use this same entry point, and it stays stable across all of 2.x. This matters for the research as well as for users. A compiler you can drive from the outside, and that gives the same answer for the same input, is one you can benchmark, replay, and check.

## Bet 5: AI that can help but can't decide

We drew one hard line. No AI model is ever asked whether a program is accepted, rejected, or how it is compiled. The same source code gives the same errors every time, with no network and no hidden state. That is why you can trust the compiler's verdict. It is also why we can study the model freely, since nothing it does can change that verdict.

AI sits outside that line as an optional helper. If you pass `--smart`, an error that the compiler can't fix by itself goes to a small language model running on your own computer. We develop against a coding model with 1.5 billion parameters, which takes up about 1 GB of disk. Nothing is sent anywhere, nothing runs when your code compiles cleanly, and we don't ship a model. You choose one.

The helper works like a ladder, with the cheapest and most certain step first. At the bottom is the compiler's own error, with its location, code, hint, and explanation. The next step is a rule-based fix. It is used when there is exactly one right edit, like a misspelled variable with a single close match, and no model is involved. Only what the rules can't fix goes up to the model.

Every step is held to the same standard. A fix, from a rule or from the model, is tried on a separate copy of your program. You see it only if it removes the error without causing a new one. If it doesn't, you simply see the compiler's normal error, unchanged.

We also give the model as much help as we can. It sees the exact code, a structured description of where the error is, and the documentation page for that error code. We test that documentation like code: every example in it must compile. A small model copies what it sees, so a wrong example would teach it wrong answers.

### What we've measured so far

We built the benchmark before we built more features, so that we couldn't fool ourselves. It takes real tests that pass and breaks them on purpose with small automatic changes, like deleting a semicolon, swapping a type, removing a brace, or swapping two names. Then it records what the helper does.

For every fix the helper would show, the benchmark also compiles and runs the fixed program. The test's own checks decide whether the fix was really right. A fix that merely compiles gets no credit.

The corpus we are working toward has 100 broken programs. The first run we wrote down was much smaller, with just six cases. It is the only run we can describe in detail here, so please treat it as a rough sketch and not a trend. Two of the six were fixed by a rule, with no model, in about a tenth of a second. One was fixed by the model, and the program's own checks still passed afterward. For the other three, nothing was shown, and you would have seen the compiler's usual error. Not one displayed fix was wrong.

Two things in these results are not flattering to the model. First, the rules did most of the work. The two rule fixes took a tenth of a second. The cases that went to the model took between 105 and 171 seconds on our development machine, and in three of those four the model found nothing it could verify. A tool that takes two minutes to fail doesn't make anyone faster. That is why rules come first on the ladder, and why we have proposed moving more of these fixes into the compiler itself, where they would show up in every build without any model.

Second, the safety net worked. Every suggestion is checked before you see it, so when the model can't find a checked fix, it shows nothing. In our run it never showed a wrong one. That says something solid about the design. With only three fixes shown, it says very little about the model, and we don't want to oversell it.

The bigger runs, on the full 100-program corpus and on the six-file speed benchmark, were done on a training machine that is not the one we are writing this on. We will gladly help anyone who wants to reproduce them. The scripts, the corpus, and the way we judge fixes are all in the repository, so the numbers can be checked by someone other than us. Until that happens, please treat our larger numbers as claims, not as settled facts.

### What we still don't know

There is a lot we haven't answered. We don't know how the numbers change with a bigger corpus, or with the mistakes real beginners make, which are messier than anything a script can produce. We don't know if a better small model, or one trained on Turf, would succeed often enough to be worth the wait. And we don't know whether faster feedback, from rules or from a model, helps people finish programs sooner. That last question needs real people, not benchmarks, and we haven't done it yet. We would rather publish our numbers, even the ones that don't look good, than make a claim we can't back up.

## The rulebook is the repo

Turf has a short constitution, with eight principles and three non-goals. We don't treat it as a manifesto. A principle that nothing enforces is just a wish, so the repository itself holds the rules.

A guarantee that is written down but not enforced counts as a bug. A table links each frozen decision to the tests that check it, and the examples in the documentation are compiled in CI. The compiler and runtime run under sanitizers and a fuzzer, and bad input must always give a clear error, never a crash. The public surface of the standard library is a promise to users, and a script checks it. When something has to break, it comes with a recorded decision and a way to migrate.

The AI work follows the same rules, and it depends on them. The compiler is the authority, and its verdict never depends on a model. Because of that, we can change the model, retrain it, or remove it entirely, and the language doesn't change at all.

## What Turf will not be

It matters just as much to say what we are not trying to do. Turf has no borrow checker, so if you want the strongest compile-time memory guarantees and don't mind the extra effort, Rust is the better tool. It has no mode for embedded systems that can't have a runtime, because Turf has a runtime. It has no AI in the compilation path, now or ever. And it isn't finished: version 2.0 has no closures, no concurrency, and no package registry. Some of these are on a public list of things we might add. For the rest, the answer is "no" until someone makes a good case.

## Is it for you?

Turf is a good fit if you want native programs, memory safety that is enforced, and a language that explains itself, and you would rather spend your energy on your problem than on the memory model. It is also a good fit if you are curious about the research and want to help. A bigger, messier corpus is the most useful thing anyone can add.

If you need no runtime at all, or the strongest compile-time guarantees, other languages will serve you better, and we would rather tell you that now.

If you want to try it, the [Learn section](/learn/) is a gentle place to start. The [download page](/download/) has the installer, and the [documentation](/docs/) has the full reference.
