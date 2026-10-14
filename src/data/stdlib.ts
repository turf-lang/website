export interface StdlibModule {
    name: string;
    purpose: string;
    import: string | null;
    href: string;
}

export const stdlibModules: StdlibModule[] = [
    { name: "int, double, bool, char", purpose: "helpers on the primitive types: `n.gcd(m)`, `x.round()`, `c.is_digit()`", import: null, href: "/stdlib/core/" },
    { name: "strings", purpose: "string search, slicing, trimming, splitting, parsing, `StringBuilder`", import: null, href: "/stdlib/core/#strings" },
    { name: "array", purpose: "`sum`, `max`, `min`, `contains`, `index_of` over `int[]`, `double[]`, `string[]`", import: null, href: "/stdlib/core/#array" },
    { name: "io", purpose: "printing, reading input, reading and writing files, `exists`", import: null, href: "/stdlib/io-and-net/" },
    { name: "math", purpose: "`abs`, `min`, `max`, `clamp`, `power`, libm functions, `divide`, constants", import: null, href: "/stdlib/math-and-os/" },
    { name: "sys", purpose: "`panic`, `exit`, `abort`", import: null, href: "/stdlib/io-and-net/" },
    { name: "list", purpose: "`List<T>`, a growable array", import: "import list::List;", href: "/stdlib/collections/" },
    { name: "stack", purpose: "`Stack<T>`, last in first out", import: "import stack::Stack;", href: "/stdlib/collections/" },
    { name: "queue", purpose: "`Queue<T>`, first in first out", import: "import queue::Queue;", href: "/stdlib/collections/" },
    { name: "map", purpose: "`Map<K, V>`, a hash map", import: "import map::Map;", href: "/stdlib/collections/" },
    { name: "set", purpose: "`Set<T>`, a hash set", import: "import set::Set;", href: "/stdlib/collections/" },
    { name: "hashing", purpose: "`hash(x)`, the hash `Map` and `Set` use", import: "import hashing;", href: "/stdlib/collections/" },
    { name: "net", purpose: "TCP client and server sockets", import: "import net;", href: "/stdlib/io-and-net/#net" },
    { name: "fs", purpose: "path strings and directories", import: "import fs;", href: "/stdlib/fs/" },
    { name: "os", purpose: "environment variables and command-line arguments", import: "import os;", href: "/stdlib/math-and-os/" },
    { name: "time", purpose: "the clock, elapsed time, sleeping", import: "import time;", href: "/stdlib/time/" },
    { name: "random", purpose: "pseudo-random numbers", import: "import random;", href: "/stdlib/random/" },
    { name: "mem", purpose: "manual-heap allocation and raw memory", import: "import mem;", href: "/stdlib/mem/" },
    { name: "json", purpose: "parse and build JSON", import: "import json;", href: "/stdlib/json/" },
    { name: "http", purpose: "a small HTTP/1.1 server and request/response types", import: "import http;", href: "/stdlib/http/" },
    { name: "test", purpose: "`assert`, `assert_eq`, `fail`", import: "import test;", href: "/stdlib/testing/" },
];
