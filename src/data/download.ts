import { releasesRepo } from "../lib/download";
import { turfVersion } from "./site";

export interface DownloadPlatform {
    id: string;
    os: "linux" | "macos" | "windows";
    arch: "x64" | "arm64";
    name: string;
    arch_label: string;
    slug: string;
    ext: "tar.gz" | "zip";
    note: string;
    warning?: string;
}

export const platforms: DownloadPlatform[] = [
    {
        id: "linux-x64",
        os: "linux",
        arch: "x64",
        name: "Linux",
        arch_label: "x86-64",
        slug: "linux-x86_64",
        ext: "tar.gz",
        note: "Needs glibc 2.34 or newer (Ubuntu 22.04, Debian 12, RHEL 9, Amazon Linux 2023 and later).",
    },
    {
        id: "linux-arm64",
        os: "linux",
        arch: "arm64",
        name: "Linux",
        arch_label: "arm64",
        slug: "linux-arm64",
        ext: "tar.gz",
        note: "64-bit ARM. Needs glibc 2.34 or newer, like x86-64.",
    },
    {
        id: "macos-arm64",
        os: "macos",
        arch: "arm64",
        name: "macOS",
        arch_label: "Apple Silicon",
        slug: "macos-arm64",
        ext: "tar.gz",
        note: "Intel Macs are not supported.",
        warning: "Intel Macs are not supported. This download is for Apple Silicon only, so check About This Mac before you download.",
    },
    {
        id: "windows-x64",
        os: "windows",
        arch: "x64",
        name: "Windows",
        arch_label: "x86-64",
        slug: "windows-x86_64",
        ext: "zip",
        note: "Native; no MSYS2 or other toolchain to install.",
    },
];

export const downloadLead =
    "Get the `turf` command for your platform. Each release is self-contained: nothing else needs installing to compile and run programs.";

export const smartNote =
    "Every release has two archives per platform: the plain one, and a `-smart` one, which is the same compiler with the runtime for `--smart` added. Choose plain unless you want `--smart`.";

export const plainBuild = {
    title: "Standard",
    text: "No `--smart` runtime: `--smart` cannot call the AI and just shows the compiler's diagnostics.",
};

export const smartBuild = {
    title: "Smart",
    text: "Adds the `--smart` runtime, so an error can go to a small local language model. Needs a model you download yourself (below).",
};

export const smartModel = {
    title: "Smart builds need a model",
    text: "No model is shipped or downloaded. Download a small language model (a `.gguf` file) separately and put exactly one in the `models` folder of your install: `~/.turf/models` (Windows: `%LOCALAPPDATA%\\turf\\models`). Its name does not matter. With no model, or more than one, `--smart` says so in one line and shows the compiler's diagnostics.",
    recommended: "We recommend Qwen2.5-Coder 1.5B Instruct (Q4_K_M): about 1 GB on disk and about 1.5 GB of RAM while it works. It is what Turf is developed with.",
    linkLabel: "Get the Qwen model",
    href: "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF",
};

export const byHand =
    "Unpack the archive anywhere, and run `bin/turf` or put `bin/` on your `PATH`. It is one folder: `bin/` (`turf`, `turfc`), `lib/` (runtime and standard library), `docs/`, `share/turf/examples/`. No `TURF_HOME` is needed.";

export const checkInstall = "Check the install with `turf version`, which prints the versions of `turf` and of the compiler `turfc` behind it.";

export interface ResolvedFile {
    name: string;
    url: string;
    size?: number;
}

export interface ResolvedPlatform extends DownloadPlatform {
    plain: ResolvedFile;
    smart: ResolvedFile;
}

export interface ResolvedRelease {
    version: string;
    tag: string;
    notesUrl: string;
    date: string;
    checksumsUrl: string;
    platforms: ResolvedPlatform[];
}

const fallbackDate = "2026-10-14T11:57:09Z";

const fallbackSizes: Record<string, number> = {
    "turf-v2.0.0-linux-arm64.tar.gz": 48360910,
    "turf-v2.0.0-linux-arm64-smart.tar.gz": 49909107,
    "turf-v2.0.0-linux-x86_64.tar.gz": 52414719,
    "turf-v2.0.0-linux-x86_64-smart.tar.gz": 54109194,
    "turf-v2.0.0-macos-arm64.tar.gz": 36068104,
    "turf-v2.0.0-macos-arm64-smart.tar.gz": 37585401,
    "turf-v2.0.0-windows-x86_64.zip": 47160108,
    "turf-v2.0.0-windows-x86_64-smart.zip": 48758652,
};

export async function resolveRelease(): Promise<ResolvedRelease> {
    let tag = `v${turfVersion}`;
    let date = fallbackDate;
    let sizes = new Map<string, number>(Object.entries(fallbackSizes));
    try {
        const response = await fetch(`https://api.github.com/repos/${releasesRepo}/releases/latest`, {
            headers: { Accept: "application/vnd.github+json" },
        });
        if (response.ok) {
            const release = (await response.json()) as { tag_name: string; published_at: string; assets: { name: string; size: number }[] };
            if (Number.parseInt(release.tag_name.replace(/^v/, ""), 10) >= 2) {
                tag = release.tag_name;
                date = release.published_at;
                sizes = new Map(release.assets.map((asset) => [asset.name, asset.size]));
            }
        }
    } catch {}

    const base = `https://github.com/${releasesRepo}/releases/download/${tag}`;
    const file = (name: string): ResolvedFile => ({ name, url: `${base}/${name}`, size: sizes.get(name) });

    return {
        version: tag.replace(/^v/, ""),
        tag,
        date,
        notesUrl: `https://github.com/${releasesRepo}/releases/tag/${tag}`,
        checksumsUrl: `${base}/checksums.txt`,
        platforms: platforms.map((platform) => ({
            ...platform,
            plain: file(`turf-${tag}-${platform.slug}.${platform.ext}`),
            smart: file(`turf-${tag}-${platform.slug}-smart.${platform.ext}`),
        })),
    };
}

export function formatSize(bytes?: number): string {
    return bytes ? `${Math.round(bytes / 1e6)} MB` : "";
}

export function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
