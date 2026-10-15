import { getCollection } from "astro:content";
import type { CollectionEntry } from "astro:content";
import { getReleases } from "./github";
import type { Release } from "./github";

export interface ReleaseEntry {
    tag: string;
    title: string;
    summary: string;
    date: Date;
    prerelease: boolean;
    released: boolean;
    href: string;
    github?: Release;
    notes?: CollectionEntry<"releases">;
}

const plainText = (html: string) =>
    html
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();

function excerpt(html: string): string {
    for (const match of html.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
        const text = plainText(match[1]);
        if (!text || /^full changelog/i.test(text)) continue;
        return text.length > 180 ? `${text.slice(0, 177).trimEnd()}…` : text;
    }
    const changes = (html.match(/<li>/g) ?? []).length;
    return changes > 0 ? `${changes} changes listed in the changelog.` : "";
}

export const releaseHref = (tag: string) => `/community/releases/${tag}/`;

export interface ReleaseEntries {
    entries: ReleaseEntry[];
    latest?: ReleaseEntry;
    upcoming: ReleaseEntry[];
    ok: boolean;
}

export async function getReleaseEntries(): Promise<ReleaseEntries> {
    const [github, notes] = await Promise.all([getReleases(), getCollection("releases")]);
    const byTag = new Map<string, ReleaseEntry>();

    for (const release of github.data) {
        byTag.set(release.tag, {
            tag: release.tag,
            title: release.name,
            summary: excerpt(release.html),
            date: release.date,
            prerelease: release.prerelease,
            released: true,
            href: releaseHref(release.tag),
            github: release,
        });
    }

    for (const entry of notes) {
        const existing = byTag.get(entry.data.tag);
        byTag.set(entry.data.tag, {
            tag: entry.data.tag,
            title: entry.data.title,
            summary: entry.data.description,
            date: existing?.date ?? entry.data.date,
            prerelease: existing?.prerelease ?? false,
            released: existing ? true : !github.ok,
            href: releaseHref(entry.data.tag),
            github: existing?.github,
            notes: entry,
        });
    }

    const entries = [...byTag.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
    return {
        entries,
        latest: entries.find((entry) => entry.released),
        upcoming: entries.filter((entry) => !entry.released),
        ok: github.ok || notes.length > 0,
    };
}
