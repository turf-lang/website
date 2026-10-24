import { getCollection } from "astro:content";
import { getSection } from "../data/navigation";
import { formatTdpNumber, getProposals, tdpSlug, tdpStatusHref, tdpStatusInfo, tdpStatusOrder } from "./content";
import { getFlatDocs } from "./docs";
import { getReleaseEntries } from "./releases";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export function ogKey(pathname: string): string {
    return pathname.replace(/^\/|\/$/g, "") || "index";
}

export interface OgPage {
    title: string;
    eyebrow: string;
    description?: string;
    meta?: string[];
}

const shortDate = (date: Date) => date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export async function getOgPages(): Promise<Map<string, OgPage>> {
    const pages = new Map<string, OgPage>();
    const add = (path: string, page: OgPage) => pages.set(ogKey(path), page);

    add("/", { title: "Turf", eyebrow: "Programming language", description: "A programming language that kinda knows what you want." });
    add("/docs/", { title: "Docs", eyebrow: "Turf" });
    add("/download/", { title: "Download", eyebrow: "Turf" });
    add("/blog/", { title: getSection("blog").label, eyebrow: "Turf" });
    add("/learn/", { title: getSection("learn").label, eyebrow: "Turf" });
    add("/resources/", { title: getSection("resources").label, eyebrow: "Turf" });
    add("/community/", { title: "Open Source", eyebrow: "Community" });
    add("/community/releases/", { title: "Release notes", eyebrow: "Community" });
    add("/community/issues/", { title: "Open issues", eyebrow: "Community" });
    add("/community/contributors/", { title: "Top contributors", eyebrow: "Community" });
    add("/community/projects/", { title: "Made with Turf", eyebrow: "Community" });
    add("/community/maintainers/", { title: "Maintainers", eyebrow: "Community" });
    add("/stdlib/", { title: getSection("stdlib").heading, eyebrow: "Turf" });
    add("/tsg/", { title: getSection("tsg").heading, eyebrow: "Turf" });
    add("/tdp/", { title: "Constitution", eyebrow: "TDP" });
    add("/tdp/process/", { title: "Process", eyebrow: "TDP" });

    for (const status of tdpStatusOrder) {
        if ((await getProposals(status)).length > 0) {
            add(tdpStatusHref(status), { title: tdpStatusInfo[status].label, eyebrow: "TDP", description: tdpStatusInfo[status].lead });
        }
    }

    for (const post of await getCollection("blog", ({ data }) => !data.draft)) {
        add(`/blog/${post.id}/`, {
            title: post.data.title,
            eyebrow: "Blog",
            description: post.data.description,
            meta: [post.data.author, shortDate(post.data.date)],
        });
    }
    for (const [collection, eyebrow] of [
        ["learn", "Learn"],
        ["stdlib", "Standard library"],
        ["resources", "Resources"],
    ] as const) {
        for (const entry of await getCollection(collection)) {
            add(`/${collection}/${entry.id}/`, { title: entry.data.title, eyebrow, description: entry.data.description });
        }
    }
    for (const entry of await getCollection("tsg", ({ id }) => id !== "overview")) {
        add(`/tsg/${entry.id}/`, { title: entry.data.title, eyebrow: "Style guide", description: entry.data.description });
    }
    for (const proposal of await getCollection("tdp")) {
        const { data } = proposal;
        add(`/tdp/${tdpSlug(data)}/`, {
            title: data.title,
            eyebrow: formatTdpNumber(data),
            description: data.description,
            meta: [capitalize(data.status), shortDate(data.date)],
        });
    }
    for (const release of (await getReleaseEntries()).entries) {
        add(release.href, {
            title: release.tag,
            eyebrow: "Release notes",
            description: release.summary || release.title,
            meta: release.released ? [shortDate(release.date)] : undefined,
        });
    }
    for (const doc of await getFlatDocs()) {
        add(doc.href, { title: doc.title, eyebrow: "Docs", description: doc.entry.data.description });
    }

    return pages;
}
