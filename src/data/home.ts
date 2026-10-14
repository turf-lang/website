export const repoUrl = "https://github.com/turf-lang/turf-lang";
export const constitutionUrl = "/tdp/";

export interface Principle {
    numeral: string;
    title: string;
    body: string;
}

export const principles: Principle[] = [
    {
        numeral: "I",
        title: "Safe by default, unsafe by declaration",
        body: "Safe Turf code cannot corrupt memory. Programmers do not write lifetimes or borrow annotations to get this; the language and its runtime carry that responsibility.",
    },
    {
        numeral: "II",
        title: "Native performance, with costs you can read",
        body: "Turf compiles ahead of time to native code through LLVM. The cost of an operation should be predictable from the code that spells it.",
    },
    {
        numeral: "IV",
        title: "Nothing crosses a boundary implicitly",
        body: "Visibility, imports, errors, and foreign calls are explicit where they happen. When code reaches across a boundary, the reader can see it.",
    },
    {
        numeral: "VII",
        title: "Stability is a promise",
        body: "A public interface, once released, is not broken casually. When a change must break something, it comes with a deliberate decision and a migration path.",
    },
];

export interface Tradeoff {
    language: string;
    gets: string;
    pays: string;
}

export const landscape: Tradeoff[] = [
    { language: "C", gets: "speed from trusting the programmer", pays: "safety" },
    { language: "C++", gets: "speed and abstraction from templates and manual control", pays: "safety, and a very large language" },
    { language: "Rust", gets: "safety from its type system", pays: "programmer effort" },
    { language: "Zig", gets: "control and simplicity by making every allocation explicit", pays: "safety left to the programmer" },
    { language: "Go", gets: "simplicity from a runtime and a small feature set", pays: "a runtime, and fewer language features" },
    { language: "Java", gets: "safety and portability from a virtual machine", pays: "startup time and memory" },
    { language: "Python", gets: "ease from dynamic typing and an interpreter", pays: "speed" },
];

export const turfTradeoff = {
    gets: "native speed and enforced safety, with effort spent on the problem",
    pays: "a runtime: no borrow checker, and no targets that cannot host one",
};

export const turfPosition =
    "Turf aims to offer native speed and enforced safety with the programmer's effort spent on the problem, not on the memory model, with diagnostics clear enough to teach the language as you use it.";

export interface TourStep {
    id: string;
    label: string;
    body: string;
    filename: string;
    source: string;
    output: string;
}

export const tour: TourStep[] = [
    {
        id: "variables",
        label: "Variables",
        body: "A declaration is `mut` (can be reassigned) or `immut`. The type is written, or left out and inferred from the initializer. Conversions are explicit, with `to`; `give ... otherwise` is the conditional expression. Integer arithmetic is checked: signed overflow and division by zero panic at run time rather than wrapping.",
        filename: "variables.tr",
        source: `fn main(): int {
    mut count = 0;                       // inferred int; same as \`count: guess = 0\`
    immut ratio: double = 7 to double / 2.0;
    immut label = "turf";                // inferred string

    for i in 1..6 step i += 1 {
        if i % 2 == 0 { continue; }
        count = count + i;
    }

    mut size: string = count > 5 give "big" otherwise "small";
    printline(label + ": " + size + " " + (count to string));
    printline(ratio to string);
    return 0;
}`,
        output: "turf: big 9\n3.5",
    },
    {
        id: "compare",
        label: "Patterns",
        body: "`compare` takes a value, an enum, or a struct taken apart by a pattern. Arms are tried in order and the first match wins. For an enum, leaving a variant out is a compile error (E093) unless `otherwise` is there.",
        filename: "compare.tr",
        source: `struct Point { x: int, y: int }

enum Color { Red, Green, Blue }

fn describe(p: Point): string {
    compare p {
        matches Point { x: 0, y: 0 }:
            return "origin";
        done
        matches Point { x, y } if x == y:
            return "diagonal at " + (x to string);
        done
        matches Point { x: 0, .. }:
            return "on the y axis";
        done
        otherwise:
            return "somewhere else";
    }
}

fn name(c: Color): string {
    compare c {
        matches Color::Red: return "red"; done
        matches Color::Green: return "green"; done
        matches Color::Blue: return "blue"; done
    }
}

fn main(): int {
    mut p: Point = Point::default();
    printline(describe(p));
    p.x = 3;
    p.y = 3;
    printline(describe(p));
    p.y = 4;
    printline(describe(p));
    printline(name(Color::Green));
    return 0;
}`,
        output: "origin\ndiagonal at 3\nsomewhere else\ngreen",
    },
    {
        id: "errors",
        label: "Errors",
        body: "A function that can fail returns `!T`. The result cannot be used as a plain `T` until you deal with it: `recover` supplies a fallback or runs a block, and `try` hands a failure to your own caller unchanged.",
        filename: "errors.tr",
        source: `error ParseError {
    Empty,
    BadDigit(text: string)
}

fn parse(text: string): !int {
    if text == "" {
        return ParseError::Empty;
    }
    for i in 0..text.length() step i += 1 {
        if !text[i].is_digit() {
            return ParseError::BadDigit(text);
        }
    }
    return text to int;
}

fn total(a: string, b: string): !int {
    immut x: int = try parse(a);     // on failure, returns parse's error unchanged
    immut y: int = try parse(b);
    return x + y;
}

fn totalOrZero(a: string, b: string): int {
    return total(a, b) recover as err run {
        compare err {
            matches ParseError::BadDigit(t):
                printline("not a number: " + t);
            done
            otherwise:
                printline("empty input");
        }
        return 0;
    };
}

fn main(): int {
    printline(totalOrZero("20", "22") to string);
    printline(totalOrZero("20", "4x") to string);
    printline(totalOrZero("", "1") to string);
    return 0;
}`,
        output: "42\nnot a number: 4x\n0\nempty input\n0",
    },
    {
        id: "references",
        label: "References",
        body: "`&T` is a reference that is never null. `&?T` may be `null`, and the compiler only lets you read through it where it has proved it is not. `heap(value)` copies a value onto the garbage-collected heap, which makes a linked list or a tree possible in safe code.",
        filename: "references.tr",
        source: `struct Node {
    val: int,
    next: &?Node       // a node, or nothing
}

fn push(head: &?Node, v: int): &Node {
    mut n: Node = Node::default();
    n.val = v;
    n.next = head;
    return heap(n);    // copy to the GC heap, get a &Node
}

fn sum(head: &?Node): int {
    mut total = 0;
    mut cur: &?Node = head;
    while cur != null {
        total = total + cur.val;   // legal: the check proves cur is not null
        cur = cur.next;
    }
    return total;
}

fn main(): int {
    mut list: &?Node = null;
    for i in 1..5 step i += 1 {
        list = push(list, i);
    }
    printline(sum(list) to string);
    return 0;
}`,
        output: "10",
    },
    {
        id: "generics",
        label: "Generics",
        body: "Structs, functions and methods take type parameters, written `<T>` after `fn` for functions and methods. Each instantiation is compiled to code specialised for its types, so the standard collections are ordinary generic types.",
        filename: "generics.tr",
        source: `import list::List;
import map::Map;

struct Box<T> {
    val: T
}

fn<T> Box.new(v: T): void {
    self.val = v;
}

fn<T> Box.get(): T {
    return self.val;
}

fn<T> largest(items: List<T>, less: fn(T, T): bool): T {
    mut best: T = items.get(0);
    for i in 1..items.length() step i += 1 {
        if less(best, items.get(i)) {
            best = items.get(i);
        }
    }
    return best;
}

fn lessInt(a: int, b: int): bool { return a < b; }

fn main(): int {
    mut b: Box<string> = Box::new("generic");
    printline(b.get());

    mut nums: List<int> = List::default();
    nums.push(3);
    nums.push(9);
    nums.push(4);
    printline(largest(nums, lessInt) to string);

    mut ages: Map<string, int> = Map::default();
    ages.put("ada", 36);
    printline(ages.get("ada") to string);
    return 0;
}`,
        output: "generic\n9\n36",
    },
    {
        id: "machines",
        label: "State machines",
        body: "`machine` declares states and the transitions allowed between them, and `.transition(State)` moves a variable along an edge. Where the compiler can prove the edge exists it costs nothing; otherwise it is checked at run time, and an edge the graph does not declare panics.",
        filename: "door.tr",
        source: `machine Door {
    Closed -> Open,
    Open -> Closed,
    Closed -> Locked,
    Locked -> Closed
}

fn main(): int {
    mut door: Door = Door::Closed;
    door.transition(Door::Open);
    door.transition(Door::Closed);
    door.transition(Door::Locked);
    printline(door == Door::Locked give "locked" otherwise "not locked");
    return 0;
}`,
        output: "locked",
    },
    {
        id: "defer",
        label: "Defer",
        body: "A `defer`red statement runs when the enclosing block is left, on every path out of it, last deferred first. It is how you release a file or a socket, which the garbage collector does not do for you.",
        filename: "defer.tr",
        source: `struct Log { text: string }

fn work(log: &Log): void {
    defer log.text = log.text + " cleanup";   // runs when work returns
    log.text = log.text + " working";
}

fn main(): int {
    mut log: Log = Log::default();
    work(&log);
    printline(log.text);
    return 0;
}`,
        output: " working cleanup",
    },
];

export const install = {
    unix: "curl -fsSL https://turflang.org/install.sh | sh",
    windows: "irm https://turflang.org/install.ps1 | iex",
};

export const installNote =
    "The installer checks the archive's SHA-256, unpacks it into `~/.turf` (Windows: `%LOCALAPPDATA%\\turf`) and adds `turf` to your `PATH`.";

export const quickStartNote = "`turf new` creates a project, `turf run` builds and runs it.";

export const platformsNote =
    "Every platform is Tier 1: tested on every change, and a release is blocked on it.";

export const toolchainIntro =
    "`turf` compiles single files, and in a project it reads `turf.toml`, fetches dependencies and drives the compiler.";

export const diagnosticsNote =
    "Stable error codes, precise source locations, and a written explanation for every code through `turf explain`. The same mistake never produces a wall of follow-on errors.";

export const smartNote =
    "With `--smart`, an error the compiler cannot fix by itself is passed to a small language model running locally through `llama.cpp`. No network is involved, and nothing runs on a clean compile. A suggestion is never trusted: it is applied to an isolated copy of your program and shown only if it removes the error without introducing another.";

export const stdlibNote = "Names are `snake_case`; an operation that can fail returns `!T` and never a sentinel.";

export const quickStart = `$ turf new hello
Created program package 'hello' in hello/
  hello/turf.toml
  hello/src/main.tr
  hello/README.md
  hello/.vscode/extensions.json
  hello/.gitignore
$ cd hello
$ turf run
Hello, TurfLang! This is hello.`;

export const platforms = [
    { name: "Linux x86-64", note: "glibc 2.34 or newer" },
    { name: "Linux arm64", note: "glibc 2.34 or newer" },
    { name: "Windows x86-64", note: "native, no MSYS2" },
    { name: "macOS arm64", note: "Apple Silicon only" },
];

export interface CommandGroup {
    label: string;
    commands: [name: string, description: string][];
}

export const commandGroups: CommandGroup[] = [
    {
        label: "Any file",
        commands: [
            ["compile", "compile a file to an executable"],
            ["run", "compile to a temporary executable and run it"],
            ["check", "report every diagnostic, write no file"],
            ["fmt", "format source files"],
            ["explain", "explain an error code"],
            ["migrate", "migrate source across a language change"],
        ],
    },
    {
        label: "Project",
        commands: [
            ["new", "create a project"],
            ["build", "build the project"],
            ["test", "run the project's tests"],
            ["add", "add a dependency"],
            ["fetch", "download dependencies"],
            ["update", "update git dependencies"],
        ],
    },
];

export const diagnostic = `$ turf check oob.tr
oob.tr (1 error)

── error at line 4, col 18 [E001 · array error]

  Array index out of bounds!
  You tried to access 'primes[5]', but 'primes' only has 3 elements (indices 0 to 2, or -1 to -3 counting from the end).

  Hint: Array indices start at 0 and go up to size - 1; a negative index counts back from the end (-1 is the last element).

  4 │     return primes[i];
    │                  ^ Here!

  Run \`turf --explain E001\` for more details.`;

export const stdlibGroups: [modules: string[], purpose: string][] = [
    [["strings", "array", "math"], "string search, slicing, splitting and parsing; `int[]` helpers; `abs`, `min`, `clamp`, libm functions"],
    [["io", "fs", "os"], "printing and input, reading and writing files; paths and directories; environment and arguments"],
    [["list", "stack", "queue", "map", "set"], "`List<T>`, `Stack<T>`, `Queue<T>`, `Map<K, V>`, `Set<T>`"],
    [["json", "http", "net"], "a JSON parser and writer; an HTTP/1.1 server and request/response types; TCP sockets and DNS"],
    [["time", "random", "mem"], "clocks and sleeping; pseudo-random numbers (not cryptographic); manual memory and `Pool`"],
    [["sys", "test"], "`panic`, `exit`; `assert`, `assert_eq`, `fail`"],
];
