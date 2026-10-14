import type { LanguageRegistration } from "shiki";
import { keywords, types } from "../turf-tokens.ts";

const words = (set: Set<string>) => `\\b(${[...set].join("|")})\\b`;

export const turfGrammar = {
    name: "turf",
    scopeName: "source.turf",
    aliases: ["tr", "turflang"],
    patterns: [
        { include: "#comment" },
        { include: "#string" },
        { include: "#char" },
        { include: "#annotation" },
        { include: "#keyword" },
        { include: "#type" },
        { include: "#number" },
        { include: "#call" },
        { include: "#punctuation" },
    ],
    repository: {
        comment: { name: "comment.line.double-slash.turf", match: "//.*$" },
        string: {
            name: "string.quoted.double.turf",
            begin: '"',
            end: '"',
            patterns: [{ name: "constant.character.escape.turf", match: "\\\\." }],
        },
        char: { name: "string.quoted.single.turf", match: "'(?:[^'\\\\\\n]|\\\\.)'" },
        annotation: { name: "keyword.turf", match: "@[A-Za-z_][A-Za-z0-9_]*" },
        keyword: { name: "keyword.turf", match: words(keywords) },
        type: { name: "support.type.turf", match: `${words(types)}|\\b[A-Z][A-Za-z0-9_]*\\b` },
        number: { name: "constant.numeric.turf", match: "\\b\\d[\\d_]*(\\.\\d+)?\\b" },
        call: { name: "entity.name.function.turf", match: "\\b[A-Za-z_][A-Za-z0-9_]*(?=\\s*\\()" },
        punctuation: { name: "punctuation.turf", match: "[(){}\\[\\];:,.+\\-*/=<>!&|%^~?]" },
    },
} as unknown as LanguageRegistration;
