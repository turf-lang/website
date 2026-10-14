import { tokenize } from "../lib/turf-tokens";

export const helloSource = `fn main(): int {
    immut name = "Turf";
    printline("Hello, " + name + "!");

    return 0;
}`;

export const helloCode = tokenize(helloSource);
