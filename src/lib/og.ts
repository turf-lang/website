import { getCollection } from "astro:content";
import { getSection } from "../data/navigation";
import { formatTdpNumber, getProposals, tdpSlug } from "./content";
import { getFlatDocs } from "./docs";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export function ogKey(pathname: string): string {
    return pathname.replace(/^\/|\/$/g, "") || "index";
}

export async function getOgPages(): Promise<Map<string, string>> {
    const pages = new Map<string, string>();
    const add = (path: string, title: string) => pages.set(ogKey(path), title);

    add("/", "Turf");
    add("/docs/", "Docs");
    add("/download/", "Download");
    add("/blog/", getSection("blog").label);
    add("/learn/", getSection("learn").label);
    add("/resources/", getSection("resources").label);
    add("/stdlib/", getSection("stdlib").heading);
    add("/tdp/", "Constitution · TDP");
    add("/tdp/process/", "Process · TDP");

    const filters = [
        ["all", "/tdp/proposals/", "Proposals"],
        ["accepted", "/tdp/proposals/accepted/", "Accepted"],
        ["implemented", "/tdp/proposals/implemented/", "Implemented"],
    ] as const;
    for (const [filter, path, title] of filters) {
        if ((await getProposals(filter)).length > 0) add(path, `${title} · TDP`);
    }

    for (const post of await getCollection("blog", ({ data }) => !data.draft)) {
        add(`/blog/${post.id}/`, post.data.title);
    }
    for (const entry of await getCollection("learn")) add(`/learn/${entry.id}/`, entry.data.title);
    for (const entry of await getCollection("stdlib")) add(`/stdlib/${entry.id}/`, entry.data.title);
    for (const entry of await getCollection("resources")) add(`/resources/${entry.id}/`, entry.data.title);
    for (const proposal of await getCollection("tdp")) {
        add(`/tdp/${tdpSlug(proposal.data.number)}/`, `${formatTdpNumber(proposal.data.number)} ${proposal.data.title}`);
    }
    for (const doc of await getFlatDocs()) add(doc.href, doc.title);

    return pages;
}
