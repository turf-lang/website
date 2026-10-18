---
title: What after now?
description: Where Turf goes from here. What the 2.x releases build toward, what Turf 3.x should let you do, how much memory safety it can honestly promise, how it works with C, where embedded systems stand, and what we would love it to do beyond the plan.
date: 2026-10-19
author: Aayush Shukla
github: a2ys
---

Turf 2.1 is out, and the question we hear most is no longer "what does it do?" but "where is it going?"

This post is our honest answer. It is about the whole 2.x series and what it adds up to in 3.x, not about any one release. It covers what you will be able to do, how much memory safety we can promise if things go well, how Turf works with C, and where embedded systems stand today. At the end, we go one step further and share a few things we would love Turf to do that are not in any plan yet.

Everything below is a plan. The proposals behind it are public, and where a plan has already changed, we say so.

## Where we are

Turf 2.1 shipped a visible piece of [TDP-2-001](/tdp/2-001/): every build now ends with a checked `Fix:` line, shown only when the compiler is sure the edit is right. It also added array initialization, size parameters like `N: size`, and an `arrays` module.

It did not ship the planned contract work, which is about how warnings are turned up or down and how an old feature is retired. So we moved that to 2.2 and pushed every later release back by one. The last 2.x release is now **2.9**. We wrote the whole order in one file so the change is visible, and we keep it current. If the plan moves again, you will see it move.

## What 3.x is meant to feel like

Here is the short version. Turf 3 should feel like the same language, with the gaps filled in and the sharp edges made safer.

Today, a few things that you would expect in a modern language are missing. There are no closures. You cannot write `for item in items` over a list. A `compare` cannot be used as a value. Two modules cannot import each other. 3.x is where those stop being true.

### Functions you can carry around

The biggest one is closures, [TDP-2-009](/tdp/2-009/). A function can be written inline, capture the variables around it, and be passed or stored like any other value:

```turf
fn make_adder(n: int): fn(int): int {
    return fn(x: int): int { return x + n; };
}

immut add5 = make_adder(5);
printline(add5(10));
```

Once that exists, the standard library can use it. `items.map(...)`, `items.filter(...)` and a web router that takes a handler all become possible. We are building it in four steps, starting with functions that capture nothing, because that first step settles how big a function value is before anything else depends on the answer.

### Loops that read the way you think

Today you walk a list by hand, with an index and a counter. [TDP-2-011](/tdp/2-011/) lets you write what you mean:

```turf
for item in items {
    printline(item);
}
```

It needs no new concept. A type can be looped over if it has `length()` and `get(i)`, and the compiler turns the loop into the index loop you would have written anyway, with the same bounds check. The same proposal lets a `Slice<T>` be stored in a struct or returned from a function, which today it cannot.

### Patterns that carry data

[TDP-2-012](/tdp/2-012/) lets `compare` be used as an expression, adds ranges, and lets a plain enum carry data:

```turf
enum Shape {
    Circle(radius: double),
    Rectangle(width: double, height: double),
    Empty,
}

immut area = compare shape {
    Circle(r) => 3.14159 * r * r,
    Rectangle(w, h) => w * h,
    Empty => 0.0,
};
```

If you forget a case, the compiler names the one you missed. A field can only be read inside the arm that matched it, so the compiler always knows the data is really there.

### Errors that tell you where they travelled

When an error comes back from three functions deep, you currently see the error but not the journey. [TDP-2-013](/tdp/2-013/) adds that journey, and a backtrace for panics. A function can also say exactly which errors it can return:

```turf
fn read_config(path: string): !Config error { NotFound, BadFormat } {
    return try parse(path);
}
```

This is optional. A function without the list works exactly as it does now.

### Smaller things that add up

Plenty of changes are small but you will notice them every day. You will be able to write `List<int>::default()` and `identity::<int>(3)` to name a type where you use it ([TDP-2-005](/tdp/2-005/)). A function marked `@test` will sit beside the code it checks, and `turf test` will run it ([TDP-2-006](/tdp/2-006/)). Types will be inferred from a constructor's arguments, so you write less ([TDP-2-010](/tdp/2-010/)). And two modules will finally be allowed to import each other ([TDP-2-014](/tdp/2-014/)).

## What Turf will let you do

Put the features above together and the language changes shape. Here is what that looks like in practice, if the plan holds.

- **Write the code the way you think it.** Loops over collections, functions passed as values, `map` and `filter`, and `compare` that gives back a value. Programs get shorter and read closer to the idea.
- **Share code.** A package registry, `turf publish` and workspaces, so a library you write can be used by someone else without you running a server. Tests live next to the code they check.
- **Use more of the machine.** Threads, then async tasks and non-blocking I/O, so a program can do several things at once or serve many connections.
- **Trust your dependencies more.** You can see how much unsafe code a package contains before you depend on it.
- **Wrap C libraries without hand-checking every call.** More on that below.

## How much memory safety can Turf promise?

This is the question we care about most, and we want to answer it carefully.

Today, safe Turf code cannot corrupt memory. A garbage collector looks after the heap. `&T` can never be null, and `&?T` has to be checked before you read through it. Integer math is checked for overflow. Anything that could break these rules has to be written inside `unsafe`.

The plan for 3.x is to close the remaining gaps around that promise, so it holds across package boundaries and across threads:

- **A library cannot leak unsafety.** A raw pointer in a package's public API becomes an error in 3.0 ([TDP-2-018](/tdp/2-018/)). The same goes for calling a method through a raw pointer without writing `unsafe`, a gap that exists today.
- **You can see the unsafe surface.** `turf audit` reports, for each package, how many `unsafe` blocks, `extern fn` declarations and native C files it has, and whether your project allowed it.
- **Threads cannot race in safe code.** Nothing is shared except through standard library types that guard it ([TDP-3-001](/tdp/3-001/)). The risky code stays inside the standard library.
- **Manual-heap mistakes become named panics.** A checking mode catches things like a write past the end of a block, and in 3.0 it is on by default for debug builds ([TDP-2-015](/tdp/2-015/)):

```text
panic: heap check failed: write past the end of a block
  block of 16 bytes allocated at buffer.tr:21
  written at buffer.tr:34
```

If all of that lands, the promise we can write down is this: **safe Turf code cannot corrupt memory, including through a library's API and including with threads. Only code marked `unsafe`, in Turf or in C, can, and that code is confined to packages that declare it, counted by `turf`, allowed by name in your manifest, and checked at run time in test builds.** A memory error then always traces back to a named unsafe region in a named package.

Here is what that does not mean. Turf will not have Rust's compile-time proofs about ownership and lifetimes, because we decided against a borrow checker. The safety comes from a runtime and from clear boundaries, and the runtime has a cost. A garbage collector can pause a program. And the compiler cannot prove `unsafe` code or C code correct. The guarantee is that such code is small, visible and checked, not that it is gone.

## How powerful can the language become?

More than it is today, but not in every direction, and we would rather say which directions.

Turf has no macros and no compile-time code execution for users, and that is on purpose. Its power comes from a small number of general tools that the standard library uses too: generics that compile into fast versions, operator overloading, `machine` declarations, and now closures, richer patterns, enum payloads and iteration. A feature that only the standard library can use is treated as a defect.

On top of that, 3.x adds the things that turn a language into a place where you can build whole programs: packages, tests, threads and async. After 3.2, Turf should be a language where a server, a command-line tool or a data pipeline is an ordinary thing to write.

What it will not become is a language for every job. It keeps its runtime and its garbage collector. For the strongest compile-time guarantees, or for programs that cannot have a runtime, other tools fit better, and we say so plainly.

## Turf and C

C is where most of the world's systems code lives, so how Turf works with C matters. Here is the plain version, starting with what you can do today.

**Today.** You can call a C function by declaring it with `extern fn` and linking the library with `--link`. You can pass a Turf function to C as a callback, as in `qsort`. The compiler trusts the signature you write. If it is wrong, the result is undefined behaviour and not an error, and every call sits inside `unsafe`. That works, but it puts all the checking on you.

**Coming.** The plan makes the boundary more careful, in two steps:

- A package can build its own C files and link system libraries from `turf.toml`, pinned by the package's hash like any other source ([TDP-2-016](/tdp/2-016/)).
- An `extern fn` can state in safe types what it expects, and the compiler turns that into checks at the call:

```turf
extern fn png_open(path: &cstring): &?Png;
extern fn png_read(img: &Png, buf: Slice<byte>): int;
extern fn png_free(img: owned &Png);
```

A `&T` is checked for null before the call. A `&?T` result has to be handled by the caller. A `Slice<T>` is passed with its real length. The exact spelling is not settled yet, so please read this as the idea. The goal is that a call like this needs no `unsafe` at the call site, because the compiler wrote the checks.

**Can Turf make C programs memory-safe?** No, and we would be misleading you if we said yes. Turf does not compile or rewrite C, and nothing can prove arbitrary C code correct. What Turf can do is contain it. You wrap a C library once, inside one package, behind a safe interface. Everything that uses your wrapper stays safe. If something goes wrong in the C code, the checking mode and the audit report lead you to the package where the `unsafe` lives, and not to a mystery crash somewhere in the middle of your program.

That is a smaller promise than "makes C safe", and it is one we can keep. It also helps in the other direction: you can write the new parts of a project in Turf, and keep the old C parts behind a fence.

Going the other way, with a C program calling into Turf, is not part of this plan. The runtime is single-threaded today, so Turf code must not be called from other threads, and that stays true until the thread-aware runtime arrives in 3.1.

## Embedded systems and real-time operating systems

We will answer this one directly: today, Turf is not a good fit for embedded systems, and for bare-metal or RTOS targets it is not a fit at all.

Our constitution says it plainly: Turf will not target no-runtime embedded systems. Turf has a runtime and a garbage collector, and environments that cannot host them are not Turf's territory. A garbage collector can also pause a program, which is the opposite of what a hard real-time deadline needs. We would rather say that than build a promise we cannot keep.

Here is the more detailed picture of what is true today.

- **A device that runs Linux can run Turf.** Linux on arm64 is a supported platform, so a board that runs a full Linux system can run Turf programs natively. That covers single-board computers and gateways, but it is a long way from a microcontroller.
- **You can compile for another processor, but not link for it.** `--target=<triple>` and `-mcpu=<cpu>` produce an object file for another machine, and then the compiler stops. Cross-linking is not supported, because the runtime library is built for the machine the compiler runs on. You would have to link the object yourself, with a runtime built for that target.
- **The collector knows two architectures.** The garbage collector needs to know how to find pointers in registers, and today it does that for x86-64 and AArch64 only.
- **There is no RTOS support.** Nothing in the plan for 2.x or 3.x targets an RTOS, and nothing in our order of releases changes that.

Some of the work on the road may help, in a small way. Cross-linking is on the future list, though it is not in the release order yet. The thread-aware runtime in 3.1 is a step for hosted systems. But none of these turns Turf into a language for bare metal.

That is the picture today. It is not where we want to stop, and near the end of this post we say why.

## The part about being careful

Here is a rule we hold ourselves to: a warning has to live in the field for a while before it is allowed to become an error.

Turf 2.2 gives every diagnostic a level you can set, and a way to mark an API as deprecated ([TDP-2-003](/tdp/2-003/)). From 2.3 on we add new warnings about unsafe code, loops that never end, recursion that never stops, and memory that is never freed ([TDP-2-007](/tdp/2-007/)). They only warn. They never reject a program that compiles today.

Then we wait. Each warning needs at least two minor releases in the field before 3.0 can turn it into an error, and only the ones that have shown no false alarms get promoted. That is why there are so many 2.x releases between now and 3.0. The length of the road is the safety.

By 2.9, you will be able to set `lint-set = "3.0"` and see every problem 3.0 would reject, as errors, while still on 2.x. `turf migrate 3.0` will do the mechanical fixes. Nothing about the jump to 3.0 should be a surprise.

## The road, release by release

This is the order as it stands today.

| Release | What it is about |
|---|---|
| **2.2** | The compatibility contract: lint levels, deprecation, JSON diagnostics, `@test`, type arguments at the use site |
| **2.3** | Diagnostics you can trust: more rule-based fixes, and the first analysis warnings |
| **2.4** | Closures and smarter generics |
| **2.5** | Iteration, storable slices, richer patterns, error traces, circular imports |
| **2.6** | Runtime and memory checks, panic backtraces |
| **2.7** | Packages: a registry, `turf publish`, workspaces, and native code with checked boundaries |
| **2.8** | A pure compiler: `turfc` only compiles, and the other jobs move into their own tools |
| **2.9** | No new features. Everything is ready for 3.0 |
| **3.0** | The breaking changes, all of them warned about before |
| **3.1 and 3.2** | Threads, then async |

Patches, like `2.4.1`, carry bug fixes and documentation only.

One detail about 2.7 is worth a sentence. The package registry ([TDP-2-017](/tdp/2-017/)) is meant to be a static index with no server. It means a Turf package can be published and found without anyone having to keep a service running forever.

## What actually breaks in 3.0

We keep the list of breaking changes short on purpose. Right now it is nine entries, and none of them is a surprise:

- Warnings that proved themselves become errors.
- Debug checks on the manual heap are on by default for debug builds ([TDP-2-015](/tdp/2-015/)).
- Things deprecated in 2.x are removed, after warning for at least two releases.
- Raw pointers in a package's public API are an error, and calling a method through a raw pointer needs `unsafe`.
- `turfc` becomes only a compiler. The assistant, formatter, migrator, test runner and explainer become their own tools ([TDP-2-019](/tdp/2-019/)).
- `recover` binds tighter than `=` and `+=`, and `turf migrate 3.0` adds the parentheses for you.

A longer list of possible breaking changes, such as new reserved words or a different type-argument spelling, is expected to stay empty. If we can make something additive instead of breaking, we will.

When 3.0 is ready, it goes out as release candidates first. Then 2.9 gets six more months of patches before 2.x reaches its end.

## After 3.0: threads and async

The two biggest features are saved until after the break, but we are designing them now so they never force a 4.0.

Threads ([TDP-3-001](/tdp/3-001/)) start from a simple default: share nothing. You hand a function some arguments and get a result back.

```turf
import thread;

fn work(n: int): int {
    return n * n;
}

fn main() {
    immut t = thread::spawn(work, 12);
    printline(t.join());
}
```

Sharing state is possible, but only through standard library types: a `Mutex`, a `RwLock`, atomics and channels. The risky code lives inside those types, so your own program contains no `unsafe` just because it uses threads.

Async ([TDP-3-002](/tdp/3-002/)) comes after, first as a library of tasks, then as non-blocking I/O with an event loop. Both of these are still drafts. The details may well change, and we would rather say that now.

## Beyond the plan: what we would love Turf to do

Everything above is written down in a proposal or in the order of releases. This section is not. Nothing here has a TDP yet, and none of it is on the road. It is what we would love Turf to be able to do one day, if we can make it work. We are writing it down in public for two reasons: so you can see the direction early, and so you can tell us early if an idea is a bad one.

Please read every example here as a sketch. None of it compiles, and the spelling will change.

### Turf on small devices

We said above that Turf is not a fit for embedded systems today. We would like to change that, carefully.

We do plan to add embedded support. It will be scoped: the larger 32-bit microcontrollers first, the kind with enough memory to hold a small runtime, and not the tiniest chips. Hard real-time deadlines are not part of the first step either. But inside that scope, we want Turf to be as lean and as fast as we can make it, and not a desktop language squeezed onto a board.

Getting there means changing the runtime itself, and that is the part we are most excited about, because it helps every Turf program and not only embedded ones:

- **A runtime built in pieces.** Today the runtime is one library, built for the machine the compiler runs on. We would like to build it from parts, so a program only carries the parts it uses. A program that never opens a file should not carry the code for files. That means smaller programs and faster start-up everywhere, including on your laptop.
- **A runtime for each target.** The same parts, built for other processors, would finally make cross-linking possible. `--target` could then give you a program you can run, and not only an object file you have to link yourself.
- **A collector that knows more chips.** The garbage collector would need to learn how to find pointers on the processors that small devices use, such as ARM Cortex-M and RISC-V.
- **Memory you set aside up front.** On a small device, a program should be able to say how much memory it may ever use, get all of it at start-up, and fail with a named error, not a mystery, if it runs out. We would also like a way to say "no collection here" around a piece of code that has a deadline.

There is a catch, and we want to name it. Our constitution says that Turf will not target no-runtime embedded systems. The plan above keeps a runtime, just a much smaller one, so it may well fit inside that line. If it turns out that it does not, we will amend the constitution. The constitution allows for that: its principles change rarely and openly, with the reasoning published. That is how we would do it, with a written amendment and the reasons behind it, before any code that depends on the change.

Some things would not change. Turf would still have no borrow checker, and the garbage collector would still be the normal way to manage memory. Embedded Turf should feel like Turf.

### Making C safer to use, not just safer to contain

Earlier we said that Turf cannot make C code memory-safe, and that is still true. But between "contain it" and "make it safe" there is a lot of useful ground. We would like Turf to cover more of it.

**Contracts on C functions.** Turf already lets you mark which C functions allocate and which ones free, with `@ownership(acquires)` and `@ownership(releases: p)`, and the compiler then catches some double frees and some use-after-frees at compile time. We would like to grow that into a small language for describing a C function honestly: who owns what it returns, which pointer it borrows from, and where a buffer's length comes from.

```turf
@ownership(acquires)
extern fn buffer_new(capacity: int): ptr;

@ownership(borrows: buf)
@length(from: len)
extern fn buffer_data(buf: ptr, len: int*): byte*;

@ownership(releases: buf)
extern fn buffer_free(buf: ptr): void;
```

From a description like this, the compiler could write the safe wrapper for you. The handle would be opaque, so callers never see the pointer. Reading the data would copy it into Turf memory with its real length. Using a handle after it is freed would be a named panic, not a corrupted heap. None of this needs a borrow checker. The checks happen at the boundary and at run time, in the way the rest of Turf already works.

**Bindings from a C header.** Writing `extern fn` lines by hand is slow and easy to get wrong. We would like a tool that reads a C header, writes the declarations for you, and then stops and asks wherever the header does not say enough. A C header says that a function returns a pointer. It almost never says who has to free it, so the tool would ask you instead of guessing.

**C checks in your tests.** When a package builds its own C files, `turf test` could build them with the checks that C compilers already have, such as AddressSanitizer and UndefinedBehaviorSanitizer. A bug in your C code would then show up as a named report while you test, and not as a crash after you ship.

None of these ideas are new on their own. Rust wraps unsafe code in safe APIs, Ada has contracts, and Clang has sanitizers. What we would like to try is putting them together, so that the normal way to use a C library in Turf is also the careful way.

We also want to be clear about what this would promise, because it is easy to say too much:

| Idea | What it could promise |
|---|---|
| A safe wrapper | Callers cannot misuse the C library through the wrapper's API |
| Contracts | The compiler enforces what the contract says, and only that |
| Header bindings | Fewer mistakes when writing declarations, never a guess about who owns what |
| Sanitizers | Some C bugs found on the paths your tests run |

A contract is only as good as its truth. If a contract says a function borrows a pointer when it really keeps it, the wrapper is wrong, and the compiler cannot know. So the promise would never be "Turf makes C safe". It would be this: **Turf lets you use C through interfaces whose rules are written down and checked, and every rule it cannot check stays visible as a trust you chose.**

### Will Turf get a borrow checker? Is Turf becoming Rust?

We get asked both, often together. The short answers are: not a full one, and no. The longer answers are more interesting.

**What a borrow checker is.** It is a check inside the compiler, and only inside it. Nothing of it is left in your program when it runs. In Rust, it follows three rules. Every value has exactly one owner, and the value is freed when its owner goes away. You may lend a value out, either to many readers or to exactly one writer, but never both at once. And a loan can never last longer than the value it points to. If your code breaks a rule anywhere, the program does not compile:

```rust
let mut v = vec![1, 2, 3];
let first = &v[0];   // a reader borrows v
v.push(4);           // error: a writer wants v while the reader still has it
println!("{first}");
```

The compiler is right to refuse. `push` may move the list to new memory, and `first` would then point at memory that was freed.

**Why Rust needs one and Turf does not.** Rust has no garbage collector. The borrow checker is how Rust knows that every value is freed exactly once, at the right moment. Turf already has a collector for that job, so the biggest reason for a borrow checker is already covered. Safe Turf code cannot use memory after it is freed, because the collector never frees memory that something can still reach.

**What a collector does not cover.** A few things are not about freeing memory, and a collector cannot help with them:

- Changing a list while you are looping over it.
- Things that must be closed at a known moment, like files, locks and C pointers. A collector frees memory eventually, and you cannot say when.
- Values that could skip the collector entirely, because they are never used outside one function. On a small device, that matters a lot.
- Two threads writing the same thing at once. For this one we already have a plan: nothing is shared except through standard library types ([TDP-3-001](/tdp/3-001/)).

**What we might add instead.** Small checks, each one aimed at one of those gaps, and each one working inside one function at a time, with no lifetimes for you to write. One would say "this value cannot leave this function", which is how a borrowed C pointer would be kept from escaping, and how a value could stay off the collector's heap. Another would say "this handle can be used up only once", so closing a file twice becomes a compile error instead of a bug. Turf already has a small check like this: the `@ownership` check that finds a double free.

Other languages with a runtime already do this. Swift counts references at run time and still checks at compile time that two pieces of code do not change a variable at once. Jane Street's version of OCaml has a garbage collector and still lets you mark a value as one that cannot escape. Pony has a collector and uses compile-time rules to rule out data races. So a runtime and checks like these can live together.

If one of these checks ever gets close to what our constitution means by a borrow checker, we will treat it the way we treat embedded support: as an open amendment, with the reasoning published, and not as a rule we quietly read around.

**So, is Turf becoming Rust?** No. Rust and Turf make different trades, on purpose. Rust proves memory safety at compile time and asks you to spend effort on ownership in return. Turf gets its safety from a runtime and from clear unsafe boundaries, and wants your effort to go into the problem you are solving. Borrowing a good idea from Rust, like safe wrappers over unsafe code, does not change that trade. If you need Rust's compile-time guarantees, or a program with no runtime at all, Rust is the better tool, and our constitution says so in as many words.

### Tell us

If you work on small devices, or you wrap C libraries for a living, these are the ideas where your experience matters most. Tell us what you need, and tell us what would make you not use Turf at all. The more we hear before a proposal is written, the better the proposal will be.

## What we are not promising

A few honest notes, so nobody plans their year around this post.

The order is a plan, not a schedule. It has already moved once, and it can move again. We attach no dates to releases, because we would rather ship a line when it is ready than ship it on time and break the promise in the previous section.

The safety promise above depends on proposals that are not built yet, and it is a goal and not a claim about 2.1. Some of the proposals are accepted and some are only proposed. The package registry, native code in packages and the pure compiler are proposed. Threads and async are drafts. A proposal can be changed, or turned down, before it is built.

The section about what we would love Turf to do is further out still. It has no proposals behind it at all, and some of it may never happen.

And the examples in this post are designs, not working code. Closures, `for` over a list, enum payloads and threads do not compile on 2.1. We used them to show the direction, not to say they work today.

## What you can do

Every proposal here has a page in the [TDP section](/tdp/), and many link to their discussion. If a design looks wrong to you, that is the cheapest moment to tell us. The ones about closures, iteration and patterns shape code you will write every day, so those are the ones we most want your eyes on.

If you would rather just use the language, [2.1 is ready to download](/download/), and the [Learn section](/learn/) is a gentle place to start. The next stop is 2.2.
