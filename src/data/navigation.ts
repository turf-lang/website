import { getTdpTabs } from "../lib/content";

export interface NavLink {
    label: string;
    href: string;
    description?: string;
}

export interface NavItem {
    label: string;
    heading?: string;
    href?: string;
    links?: NavLink[];
}

export const navigation: NavItem[] = [
    {
        label: "Learn",
        links: [
            { label: "Getting Started", href: "/learn/getting-started/", description: "Set up Turf in a few minutes." },
            { label: "Installation", href: "/learn/installation/", description: "Install on any platform." },
            { label: "Your First Program", href: "/learn/first-program/", description: "Write and run hello.tr." },
            { label: "Language Basics", href: "/learn/basics/", description: "Values, functions and types." },
            { label: "Tour of Turf", href: "/learn/tour/", description: "A guided walk through the language." },
        ],
    },
    {
        label: "Docs",
        links: [
            { label: "Language", href: "/docs/language/", description: "Every construct, in full detail." },
            { label: "Tooling", href: "/docs/tooling/", description: "The turf command, projects and packages." },
            { label: "Guides", href: "/docs/guides/", description: "A project, a library, a test suite." },
            { label: "Error codes", href: "/docs/errors/", description: "Every compiler error, explained." },
            { label: "Migrating to 2.0", href: "/docs/migrating-to-2/", description: "Everything that changed from 1.x." },
            { label: "How the compiler works", href: "/docs/compiler/", description: "From source text to native binary." },
        ],
    },
    {
        label: "Stdlib",
        heading: "Standard Library",
        links: [
            { label: "Overview", href: "/stdlib/", description: "Every module, and what you import." },
            { label: "Conventions", href: "/stdlib/conventions/", description: "Naming, failure, resources, stability." },
            { label: "Core", href: "/stdlib/core/", description: "Numbers, characters, strings and arrays." },
            { label: "Collections", href: "/stdlib/collections/", description: "Lists, stacks, queues, maps and sets." },
            { label: "I/O and networking", href: "/stdlib/io-and-net/", description: "Printing, input, files and sockets." },
            { label: "Math and OS", href: "/stdlib/math-and-os/", description: "Maths, environment and arguments." },
            { label: "Files and paths", href: "/stdlib/fs/", description: "Paths and directories." },
            { label: "Time", href: "/stdlib/time/", description: "The clock and sleeping." },
            { label: "Random", href: "/stdlib/random/", description: "Pseudo-random numbers." },
            { label: "Memory", href: "/stdlib/mem/", description: "Manual heap and raw memory." },
            { label: "JSON", href: "/stdlib/json/", description: "Parse and build JSON." },
            { label: "HTTP", href: "/stdlib/http/", description: "A small HTTP server." },
            { label: "Testing", href: "/stdlib/testing/", description: "Assertions and tests." },
        ],
    },
    {
        label: "TDP",
        heading: "Turf Design Proposals",
        links: (await getTdpTabs()).map(({ label, href, description }) => ({ label, href, description })),
    },
    {
        label: "Resources",
        links: [
            { label: "Agent skills", href: "/resources/agent-skills/", description: "Teach your coding agent Turf." },
            { label: "Troubleshooting", href: "/resources/troubleshooting/", description: "When something does not work." },
        ],
    },
    {
        label: "Open Source",
        heading: "Open Source",
        links: [
            { label: "Release notes", href: "/community/releases/", description: "What changed in every version." },
            { label: "Open issues", href: "/community/issues/", description: "Every open issue, across all five repositories." },
            { label: "Top contributors", href: "/community/contributors/", description: "The people building Turf." },
            { label: "Made with Turf", href: "/community/projects/", description: "Projects the community has built." },
            { label: "Maintainers", href: "/community/maintainers/", description: "The people who look after Turf." },
        ],
    },
    { label: "Blog", href: "/blog/" },
];

export const downloadHref = "/download/";

export interface NavSection {
    key: string;
    label: string;
    heading: string;
    root: string;
    links: NavLink[];
}

export const sections: NavSection[] = navigation.map((item) => {
    const links = item.links ?? [];
    const first = item.href ?? links[0]?.href ?? "/";
    const key = first.split("/")[1] ?? "";
    return { key, label: item.label, heading: item.heading ?? item.label, root: `/${key}/`, links };
});

export function getSection(key: string): NavSection {
    const section = sections.find((s) => s.key === key);
    if (!section) throw new Error(`Unknown navigation section: ${key}`);
    return section;
}

export function getPrevNext(key: string, href: string): { prev?: NavLink; next?: NavLink } {
    const { links } = getSection(key);
    const i = links.findIndex((link) => link.href === href);
    return { prev: i > 0 ? links[i - 1] : undefined, next: i >= 0 ? links[i + 1] : undefined };
}
