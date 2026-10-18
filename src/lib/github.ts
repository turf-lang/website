import { communityRepos, githubOrg, projectTopic, releaseRepo } from "../data/community";
import type { CommunityRepo } from "../data/community";

export interface Release {
    tag: string;
    name: string;
    date: Date;
    prerelease: boolean;
    url: string;
    html: string;
}

export interface IssueLabel {
    name: string;
    color: string;
}

export interface Issue {
    number: number;
    title: string;
    url: string;
    author: string;
    comments: number;
    created: Date;
    labels: IssueLabel[];
}

export interface RepoIssues {
    repo: CommunityRepo;
    issues: Issue[];
    url: string;
}

export interface Contributor {
    login: string;
    avatar: string;
    url: string;
    commits: number;
    repos: string[];
}

export interface Maintainer {
    login: string;
    avatar: string;
    url: string;
}

export interface Project {
    name: string;
    owner: string;
    ownerAvatar: string;
    description: string;
    url: string;
    stars: number;
    language: string | null;
    updated: Date;
    topics: string[];
}

export interface Loaded<T> {
    data: T;
    ok: boolean;
}

const API = "https://api.github.com";
const token = import.meta.env.GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;

async function request(path: string, accept = "application/vnd.github+json"): Promise<unknown> {
    const response = await fetch(`${API}${path}`, {
        headers: {
            Accept: accept,
            "User-Agent": "turflang-website",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });
    if (!response.ok) throw new Error(`GitHub ${response.status} for ${path}`);
    return response.json();
}

const cache = new Map<string, Promise<Loaded<unknown>>>();

function cached<T>(key: string, empty: T, load: () => Promise<T>): Promise<Loaded<T>> {
    let entry = cache.get(key) as Promise<Loaded<T>> | undefined;
    if (!entry) {
        entry = load().then(
            (data) => ({ data, ok: true }),
            (error) => {
                console.warn(String(error));
                return { data: empty, ok: false };
            },
        );
        cache.set(key, entry);
    }
    return entry;
}

export function getReleases(): Promise<Loaded<Release[]>> {
    return cached("releases", [], async () => {
        const raw = (await request(
            `/repos/${githubOrg}/${releaseRepo}/releases?per_page=100`,
            "application/vnd.github.html+json",
        )) as any[];
        return raw
            .filter((r) => !r.draft)
            .map((r) => ({
                tag: r.tag_name,
                name: r.name || r.tag_name,
                date: new Date(r.published_at ?? r.created_at),
                prerelease: r.prerelease,
                url: r.html_url,
                html: r.body_html ?? "",
            }))
            .sort((a, b) => b.date.getTime() - a.date.getTime());
    });
}

export function getIssues(): Promise<Loaded<RepoIssues[]>> {
    const empty = communityRepos.map((repo) => ({ repo, issues: [], url: `https://github.com/${githubOrg}/${repo.name}/issues` }));
    return cached("issues", empty, async () =>
        Promise.all(
            communityRepos.map(async (repo) => {
                const raw = (await request(
                    `/repos/${githubOrg}/${repo.name}/issues?state=open&per_page=100`,
                )) as any[];
                const issues = raw
                    .filter((i) => !i.pull_request)
                    .map((i) => ({
                        number: i.number,
                        title: i.title,
                        url: i.html_url,
                        author: i.user?.login ?? "ghost",
                        comments: i.comments,
                        created: new Date(i.created_at),
                        labels: (i.labels as any[]).map((l) => ({ name: l.name, color: l.color ?? "808080" })),
                    }))
                    .sort((a, b) => b.created.getTime() - a.created.getTime());
                return { repo, issues, url: `https://github.com/${githubOrg}/${repo.name}/issues` };
            }),
        ),
    );
}

export function getContributors(): Promise<Loaded<Contributor[]>> {
    return cached("contributors", [], async () => {
        const perRepo = await Promise.all(
            communityRepos.map(async (repo) => {
                const raw = (await request(`/repos/${githubOrg}/${repo.name}/contributors?per_page=100`)) as any[];
                return { repo: repo.name, raw: Array.isArray(raw) ? raw : [] };
            }),
        );
        const byLogin = new Map<string, Contributor>();
        for (const { repo, raw } of perRepo) {
            for (const c of raw) {
                if (c.type !== "User") continue;
                const entry = byLogin.get(c.login) ?? {
                    login: c.login,
                    avatar: c.avatar_url,
                    url: c.html_url,
                    commits: 0,
                    repos: [],
                };
                entry.commits += c.contributions;
                entry.repos.push(repo);
                byLogin.set(c.login, entry);
            }
        }
        return [...byLogin.values()].sort((a, b) => b.commits - a.commits || a.login.localeCompare(b.login));
    });
}

export function getProjects(): Promise<Loaded<Project[]>> {
    return cached("projects", [], async () => {
        const result = (await request(
            `/search/repositories?q=${encodeURIComponent(`topic:${projectTopic}`)}&sort=stars&order=desc&per_page=30`,
        )) as { items: any[] };
        return result.items
            .filter((r) => r.owner.login.toLowerCase() !== githubOrg && !r.fork && !r.archived)
            .map((r) => ({
                name: r.name,
                owner: r.owner.login,
                ownerAvatar: r.owner.avatar_url,
                description: r.description ?? "",
                url: r.html_url,
                stars: r.stargazers_count,
                language: r.language,
                updated: new Date(r.pushed_at),
                topics: (r.topics as string[]).filter((t) => t !== projectTopic),
            }));
    });
}

export function getMaintainers(): Promise<Loaded<Maintainer[]>> {
    return cached("maintainers", [], async () => {
        const raw = (await request(`/orgs/${githubOrg}/members?per_page=100`)) as any[];
        return raw
            .map((m) => ({ login: m.login as string, avatar: m.avatar_url as string, url: m.html_url as string }))
            .sort((a, b) => a.login.localeCompare(b.login));
    });
}

export function getWeeklyContributors(): Promise<Loaded<Contributor[]>> {
    return cached("contributors-weekly", [], async () => {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const perRepo = await Promise.all(
            communityRepos.map(async (repo) => {
                const raw = (await request(`/repos/${githubOrg}/${repo.name}/commits?since=${since}&per_page=100`)) as any[];
                return { repo: repo.name, raw: Array.isArray(raw) ? raw : [] };
            }),
        );
        const byLogin = new Map<string, Contributor>();
        for (const { repo, raw } of perRepo) {
            for (const c of raw) {
                if (c.author?.type !== "User") continue;
                const entry = byLogin.get(c.author.login) ?? {
                    login: c.author.login,
                    avatar: c.author.avatar_url,
                    url: c.author.html_url,
                    commits: 0,
                    repos: [],
                };
                entry.commits += 1;
                if (!entry.repos.includes(repo)) entry.repos.push(repo);
                byLogin.set(c.author.login, entry);
            }
        }
        return [...byLogin.values()].sort((a, b) => b.commits - a.commits || a.login.localeCompare(b.login));
    });
}
