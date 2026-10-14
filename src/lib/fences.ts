
const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", "#x27": "'" };

const decode = (html: string) =>
    html
        .replace(/<[^>]+>/g, "")
        .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name: string) => {
            if (entities[name]) return entities[name];
            if (name.startsWith("#x")) return String.fromCodePoint(parseInt(name.slice(2), 16));
            if (name.startsWith("#")) return String.fromCodePoint(parseInt(name.slice(1), 10));
            return whole;
        });

export function fences(html: string): string[] {
    return [...html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/g)].map((m) =>
        decode(m[1].replace(/<\/span>\s*<span class="line">/g, "</span>\n<span class=\"line\">")).replace(/\n$/, ""),
    );
}
