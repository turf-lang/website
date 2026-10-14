import { turfVersion } from "../data/site";
import { getCollection, render } from "astro:content";
import type { CollectionEntry } from "astro:content";

export type Doc = CollectionEntry<"docs">;
export type DocStatus = NonNullable<Doc["data"]["status"]>;

export const DOCS_VERSION = `v${turfVersion}`;
export const DOCS_REPO_URL = "https://github.com/turf-lang/website";
export const DOCS_REPO_BRANCH = "master";
export const DOCS_START_HERE = ["language", "guides/projects", "compiler"];

export interface DocPage {
    kind: "page";
    slug: string;
    href: string;
    title: string;
    description: string;
    order: number;
    status?: DocStatus;
    entry: Doc;
}

export interface DocGroup {
    kind: "group";
    slug: string;
    href?: string;
    title: string;
    description?: string;
    order: number;
    status?: DocStatus;
    entry?: Doc;
    children: DocNode[];
}

export type DocNode = DocPage | DocGroup;

export interface Crumb {
    label: string;
    href?: string;
}

export function docSlug(entry: Doc): string {
    return entry.id.replace(/\.(md|mdx)$/, "").replace(/(^|\/)index$/, "");
}

export function docHref(slug: string): string {
    return slug ? `/docs/${slug}/` : "/docs/";
}

export function docSourcePath(entry: Doc): string {
    return entry.filePath ?? `src/content/docs/${entry.id}.md`;
}

export function docEditUrl(entry: Doc): string {
    return `${DOCS_REPO_URL}/edit/${DOCS_REPO_BRANCH}/${docSourcePath(entry).split("\\").join("/")}`;
}

function titleCase(segment: string): string {
    const words = segment.replace(/[-_]+/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
}

function compare(a: DocNode, b: DocNode): number {
    return a.order - b.order || a.title.localeCompare(b.title, "en", { numeric: true });
}

function sortTree(nodes: DocNode[]): void {
    nodes.sort(compare);
    for (const node of nodes) if (node.kind === "group") sortTree(node.children);
}

async function getPublished(): Promise<Doc[]> {
    return getCollection("docs", ({ data }) => !data.draft);
}

export async function getDocsTree(): Promise<DocNode[]> {
    const entries = await getPublished();
    const root: DocNode[] = [];
    const groups = new Map<string, DocGroup>();

    const ensureGroup = (slug: string): DocGroup => {
        const existing = groups.get(slug);
        if (existing) return existing;
        const segments = slug.split("/");
        const group: DocGroup = {
            kind: "group",
            slug,
            title: titleCase(segments[segments.length - 1]),
            order: Number.MAX_SAFE_INTEGER,
            children: [],
        };
        groups.set(slug, group);
        const parent = segments.length > 1 ? ensureGroup(segments.slice(0, -1).join("/")) : undefined;
        (parent ? parent.children : root).push(group);
        return group;
    };

    for (const entry of entries) {
        const slug = docSlug(entry);
        const isIndex = /(^|[\\/])index\.(md|mdx)$/.test(entry.filePath ?? entry.id);
        if (isIndex) {
            if (!slug) continue;
            const group = ensureGroup(slug);
            group.entry = entry;
            group.href = docHref(slug);
            group.title = entry.data.title;
            group.description = entry.data.description;
            group.order = entry.data.order ?? Number.MAX_SAFE_INTEGER;
            group.status = entry.data.status;
            continue;
        }
        const segments = slug.split("/");
        const page: DocPage = {
            kind: "page",
            slug,
            href: docHref(slug),
            title: entry.data.title,
            description: entry.data.description,
            order: entry.data.order ?? Number.MAX_SAFE_INTEGER,
            status: entry.data.status,
            entry,
        };
        const parent = segments.length > 1 ? ensureGroup(segments.slice(0, -1).join("/")) : undefined;
        (parent ? parent.children : root).push(page);
    }

    sortTree(root);
    return root;
}

export interface FlatDoc {
    slug: string;
    href: string;
    title: string;
    entry: Doc;
}

function flatten(nodes: DocNode[], out: FlatDoc[]): void {
    for (const node of nodes) {
        if (node.kind === "page") {
            out.push({ slug: node.slug, href: node.href, title: node.title, entry: node.entry });
        } else {
            if (node.entry && node.href) out.push({ slug: node.slug, href: node.href, title: node.title, entry: node.entry });
            flatten(node.children, out);
        }
    }
}

export async function getFlatDocs(): Promise<FlatDoc[]> {
    const out: FlatDoc[] = [];
    flatten(await getDocsTree(), out);
    return out;
}

export async function getBreadcrumbs(slug: string): Promise<Crumb[]> {
    const flat = await getFlatDocs();
    const segments = slug.split("/").filter(Boolean);
    const crumbs: Crumb[] = [{ label: "Docs", href: "/docs/" }];
    for (let i = 1; i < segments.length; i++) {
        const prefix = segments.slice(0, i).join("/");
        const doc = flat.find((d) => d.slug === prefix);
        crumbs.push({ label: doc?.title ?? titleCase(segments[i - 1]), href: doc?.href });
    }
    return crumbs;
}

export interface Heading {
    depth: number;
    slug: string;
    text: string;
}

export async function getHeadings(entry: Doc): Promise<Heading[]> {
    const { headings } = await render(entry);
    return headings.filter((h) => h.depth === 2 || h.depth === 3);
}

export function findGroup(nodes: DocNode[], slug: string): DocGroup | undefined {
    for (const node of nodes) {
        if (node.kind !== "group") continue;
        if (node.slug === slug) return node;
        const found = findGroup(node.children, slug);
        if (found) return found;
    }
    return undefined;
}

export function containsSlug(node: DocNode, slug: string): boolean {
    if (node.slug === slug) return true;
    return node.kind === "group" && node.children.some((child) => containsSlug(child, slug));
}

export interface DocArea {
    group: DocGroup;
    pages: DocPage[];
}

export async function getDocAreas(): Promise<DocArea[]> {
    const areas: DocArea[] = [];
    const visit = (group: DocGroup) => {
        areas.push({ group, pages: group.children.filter((c): c is DocPage => c.kind === "page") });
        for (const child of group.children) if (child.kind === "group") visit(child);
    };
    const tree = await getDocsTree();
    for (const node of tree) if (node.kind === "group") visit(node);
    return areas;
}
