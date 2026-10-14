import { getCollection } from "astro:content";
import type { CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"blog">;
export type Proposal = CollectionEntry<"tdp">;
export type TdpStatus = Proposal["data"]["status"];

export type ProposalFilter = "all" | "accepted" | "implemented";

const WORDS_PER_MINUTE = 200;

export function readingTime(body: string | undefined): string {
    const words = (body ?? "").split(/\s+/).filter(Boolean).length;
    return `${Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))} min read`;
}

export function formatDate(date: Date): string {
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function formatTdpNumber(number: number): string {
    return `TDP-${String(number).padStart(3, "0")}`;
}

export function tdpSlug(number: number): string {
    return String(number).padStart(3, "0");
}

export async function getPosts(): Promise<Post[]> {
    const posts = await getCollection("blog", ({ data }) => !data.draft);
    return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export async function getLatestPosts(n: number): Promise<Post[]> {
    return (await getPosts()).slice(0, n);
}

export async function getProposals(filter: ProposalFilter = "all"): Promise<Proposal[]> {
    const proposals = await getCollection("tdp", ({ data }) => filter === "all" || data.status === filter);
    return proposals.sort((a, b) => b.data.date.getTime() - a.data.date.getTime() || b.data.number - a.data.number);
}

export async function getLatestProposals(n: number): Promise<Proposal[]> {
    return (await getProposals()).slice(0, n);
}

export async function getProposalsByNumber(): Promise<Proposal[]> {
    const proposals = await getCollection("tdp");
    return proposals.sort((a, b) => a.data.number - b.data.number);
}

export interface TdpTab {
    label: string;
    href: string;
    description: string;
    count?: number;
}

export async function getTdpTabs(): Promise<TdpTab[]> {
    const [all, accepted, implemented] = await Promise.all([
        getProposals(),
        getProposals("accepted"),
        getProposals("implemented"),
    ]);
    const lists: TdpTab[] = [
        { label: "Proposals", href: "/tdp/proposals/", description: "Every proposal, in one place.", count: all.length },
        { label: "Accepted", href: "/tdp/proposals/accepted/", description: "Approved and awaiting work.", count: accepted.length },
        { label: "Implemented", href: "/tdp/proposals/implemented/", description: "Shipped in a release.", count: implemented.length },
    ].filter((tab) => tab.count > 0);
    return [
        { label: "Constitution", href: "/tdp/", description: "The principles every proposal obeys." },
        ...lists,
        { label: "Process", href: "/tdp/process/", description: "How to propose a change." },
    ];
}
