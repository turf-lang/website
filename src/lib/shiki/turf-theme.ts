import type { ThemeRegistration } from "shiki";

const fg = "#e8ecf2";
const faint = "#e8ecf25c";

export const turfTheme: ThemeRegistration = {
    name: "turf",
    type: "dark",
    colors: {
        "editor.background": "#161a21",
        "editor.foreground": fg,
    },
    tokenColors: [
        { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: faint, fontStyle: "italic" } },
        { scope: ["punctuation", "punctuation.turf", "keyword.operator", "keyword.operator.turf"], settings: { foreground: faint } },
        { scope: ["keyword", "keyword.turf", "storage", "storage.type"], settings: { foreground: "#80a3cb" } },
        { scope: ["string", "string.quoted", "punctuation.definition.string"], settings: { foreground: "#e0c08f" } },
        { scope: ["constant.numeric", "constant.language"], settings: { foreground: "#e0c08f" } },
        { scope: ["entity.name.type", "support.type", "support.type.turf"], settings: { foreground: "#86c3b4" } },
        { scope: ["entity.name.function", "support.function", "variable.function"], settings: { foreground: fg } },
        { scope: ["variable", "meta.function-call"], settings: { foreground: fg } },
    ],
};
