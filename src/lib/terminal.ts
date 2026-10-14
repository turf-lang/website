
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function paintSession(source: string): string {
    return source
        .split("\n")
        .map((line) =>
            line.startsWith("$ ")
                ? `<span class="select-none text-fg-faint">$ </span><span class="text-fg">${escapeHtml(line.slice(2))}</span>`
                : `<span class="text-fg-muted">${escapeHtml(line)}</span>`,
        )
        .join("\n");
}


const span = (cls: string, text: string) => `<span class="${cls}">${text}</span>`;

const gray = "text-fg-faint";
const red = "text-term-error";
const names = (text: string) => text.replace(/'([^']*)'/g, (_, name) => `'${span("text-term-name", name)}'`);

export function paintDiagnostic(source: string): string {
    let expectMessage = false;
    return source
        .split("\n")
        .map((raw) => {
            const line = escapeHtml(raw);
            let match: RegExpMatchArray | null;

            if ((match = line.match(/^\$ (.*)$/))) return `${span(`select-none ${gray}`, "$ ")}${span("text-fg", match[1])}`;
            if ((match = line.match(/^(\S+\.tr) (\(.*\))$/))) return `${span("font-bold text-term-name", match[1])} ${span(gray, match[2])}`;
            if ((match = line.match(/^(── (?:error|warning) )(.*)$/))) {
                expectMessage = true;
                return `${span(`font-bold ${red}`, match[1])}${span(gray, match[2])}`;
            }
            if (expectMessage && line.trim()) {
                expectMessage = false;
                return span(red, line);
            }
            if (/^\s*Hint:/.test(line)) return span("text-term-hint", line);
            if ((match = line.match(/^(\s*\d* │ )(\s*)(\^.*)$/))) return `${span(gray, match[1])}${match[2]}${span(`font-bold ${red}`, match[3])}`;
            if ((match = line.match(/^(\s*\d* │ )(.*)$/))) return `${span(gray, match[1])}${span("text-fg", match[2])}`;
            if (/^\s*(Run `turf|Note:)/.test(line)) return span(gray, line);
            return names(line);
        })
        .join("\n");
}
