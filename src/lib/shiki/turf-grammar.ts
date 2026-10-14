import { readFileSync } from "node:fs";
import type { LanguageRegistration } from "shiki";

const grammar = JSON.parse(readFileSync(new URL("./turf.tmLanguage.json", import.meta.url), "utf8"));

export const turfGrammar = {
    ...grammar,
    name: "turf",
    aliases: ["tr", "turflang"],
} as unknown as LanguageRegistration;
