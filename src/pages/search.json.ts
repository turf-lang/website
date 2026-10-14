import { getCollection, render } from "astro:content";
import { docHref, docSlug } from "../lib/docs";

const plain = (mdx: string) =>
    mdx
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
        .replace(/^```[\s\S]*?^```/gm, " ")
        .replace(/<\/?[A-Za-z][^>]*>/g, " ")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[`*>#|]/g, "")
        .replace(/\s+/g, " ")
        .trim();

export async function GET() {
    const areas = [
        { area: "Learn", entries: await getCollection("learn"), href: (id: string) => `/learn/${id}/` },
        { area: "Standard library", entries: await getCollection("stdlib"), href: (id: string) => `/stdlib/${id}/` },
        { area: "Resources", entries: await getCollection("resources"), href: (id: string) => `/resources/${id}/` },
        {
            area: "Docs",
            entries: await getCollection("docs", ({ data }) => !data.draft),
            href: (id: string) => docHref(docSlug({ id } as never)),
        },
    ];
    const records = [];
    for (const { area, entries, href } of areas) {
        for (const entry of entries) {
            const { headings } = await render(entry);
            records.push({
                t: entry.data.title,
                d: entry.data.description,
                a: area,
                u: href(entry.id),
                h: headings.filter((h) => h.depth === 2 || h.depth === 3).map((h) => [h.text, h.slug]),
                b: plain(entry.body ?? "").slice(0, 30000),
            });
        }
    }
    return new Response(JSON.stringify(records), { headers: { "Content-Type": "application/json" } });
}
