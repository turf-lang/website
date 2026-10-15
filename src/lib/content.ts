import { getCollection } from "astro:content";
import type { CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"blog">;
export type Proposal = CollectionEntry<"tdp">;
export type TdpStatus = Proposal["data"]["status"];

export type ProposalFilter = "all" | TdpStatus;

export const tdpStatusOrder = ["proposed", "accepted", "implemented", "draft", "rejected", "withdrawn"] as const satisfies readonly TdpStatus[];

export const tdpStatusInfo: Record<TdpStatus, { label: string; description: string; lead: string }> = {
    proposed: {
        label: "Proposed",
        description: "Open for public discussion.",
        lead: "Open for public discussion. Read them and say what you think.",
    },
    accepted: {
        label: "Accepted",
        description: "Approved and awaiting work.",
        lead: "Approved by the maintainers and waiting to be built.",
    },
    implemented: {
        label: "Implemented",
        description: "Shipped in a release.",
        lead: "Proposals that have shipped in a release.",
    },
    draft: {
        label: "Draft",
        description: "Still being written.",
        lead: "Still being written by their authors and not yet open for review.",
    },
    rejected: {
        label: "Rejected",
        description: "Declined, with the reasons kept.",
        lead: "Declined. The text and the reasons are kept for the record.",
    },
    withdrawn: {
        label: "Withdrawn",
        description: "Pulled back by the author.",
        lead: "Pulled back by their authors before a decision.",
    },
};

export function tdpStatusHref(status: TdpStatus): string {
    return `/tdp/proposals/${status}/`;
}

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

type TdpId = Pick<Proposal["data"], "major" | "number">;

export function tdpSlug({ major, number }: TdpId): string {
    return `${major}-${String(number).padStart(3, "0")}`;
}

export function formatTdpNumber(id: TdpId): string {
    return `TDP-${tdpSlug(id)}`;
}

function byTdpNumber(a: Proposal, b: Proposal): number {
    return a.data.major - b.data.major || a.data.number - b.data.number;
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
    return proposals.sort(byTdpNumber);
}

export async function getLatestProposals(n: number): Promise<Proposal[]> {
    const proposals = await getProposals();
    return proposals.sort((a, b) => b.data.date.getTime() - a.data.date.getTime() || byTdpNumber(b, a)).slice(0, n);
}

export interface TdpTab {
    label: string;
    href: string;
    description: string;
    count?: number;
}

export async function getTdpTabs(): Promise<TdpTab[]> {
    const byStatus = await Promise.all(tdpStatusOrder.map((status) => getProposals(status)));
    const lists: TdpTab[] = tdpStatusOrder
        .map((status, i) => ({
            label: tdpStatusInfo[status].label,
            href: tdpStatusHref(status),
            description: tdpStatusInfo[status].description,
            count: byStatus[i].length,
        }))
        .filter((tab) => tab.count > 0);
    return [
        { label: "Constitution", href: "/tdp/", description: "The principles every proposal obeys." },
        { label: "Process", href: "/tdp/process/", description: "How to propose a change." },
        ...lists,
    ];
}
