export type TokenKind = "keyword" | "type" | "fn" | "string" | "number" | "punct" | "comment" | "plain";
export type Token = [kind: TokenKind, text: string];
export type Line = Token[];

export const tokenClass: Record<TokenKind, string> = {
    keyword: "text-code-keyword",
    type: "text-code-type",
    fn: "text-fg",
    string: "text-code-string",
    number: "text-code-number",
    punct: "text-fg-faint",
    comment: "text-fg-faint italic",
    plain: "text-fg-soft",
};

export const keywords = new Set([
    "fn", "mut", "immut", "guess", "return", "if", "else", "for", "in", "step", "while", "do", "break", "continue",
    "compare", "matches", "done", "otherwise", "give", "to", "struct", "enum", "error", "machine", "recover", "produce",
    "run", "as", "try", "defer", "heap", "import", "pub", "public", "extern", "from", "unsafe", "module", "operator",
    "null", "true", "false", "self",
]);
export const types = new Set(["int", "double", "bool", "char", "string", "void", "ptr"]);

const rules: [TokenKind | "ident", RegExp][] = [
    ["plain", /\s+/y],
    ["comment", /\/\/[^\n]*/y],
    ["string", /"(?:[^"\\\n]|\\.)*"?/y],
    ["number", /\d+(?:\.\d+)?/y],
    ["ident", /[A-Za-z_][A-Za-z0-9_]*/y],
    ["punct", /[^\sA-Za-z0-9_"]+/y],
];

function tokenizeLine(source: string): Line {
    const line: Line = [];
    let index = 0;
    while (index < source.length) {
        for (const [kind, pattern] of rules) {
            pattern.lastIndex = index;
            const match = pattern.exec(source);
            if (!match) continue;
            const text = match[0];
            let resolved: TokenKind;
            if (kind === "ident") {
                const next = source.slice(index + text.length).trimStart();
                resolved = keywords.has(text)
                    ? "keyword"
                    : types.has(text) || /^[A-Z]/.test(text)
                      ? "type"
                      : next.startsWith("(")
                        ? "fn"
                        : "plain";
            } else {
                resolved = kind;
            }
            line.push([resolved, text]);
            index += text.length;
            break;
        }
    }
    return line;
}

export function tokenize(source: string): Line[] {
    return source.split("\n").map(tokenizeLine);
}
