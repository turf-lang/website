export type OS = "windows" | "macos" | "linux";
export type Arch = "x64" | "arm64";

export interface Platform {
    os: OS | null;
    arch: Arch | null;
}

export interface ReleaseAsset {
    name: string;
    browser_download_url: string;
}

export interface Release {
    tag_name: string;
    html_url: string;
    assets: ReleaseAsset[];
}

export const releasesRepo = "turf-lang/turf-lang";

export const osLabels: Record<OS, string> = {
    windows: "Windows",
    macos: "macOS",
    linux: "Linux",
};

const osPatterns: Record<OS, RegExp> = {
    windows: /windows|win64|win32|[-_.]win[-_.]|\.exe$|\.msi$/i,
    macos: /macos|darwin|apple|osx|\.dmg$|\.pkg$/i,
    linux: /linux|\.deb$|\.rpm$|\.appimage$/i,
};

const archPatterns: Record<Arch, RegExp> = {
    x64: /x86_64|amd64|x64/i,
    arm64: /arm64|aarch64/i,
};

const ignored = /\.(sha256|sha512|sig|asc|txt|json|sbom)$|checksums?/i;

interface NavigatorUAData {
    platform: string;
    getHighEntropyValues(hints: string[]): Promise<{ architecture?: string }>;
}

export async function detectPlatform(): Promise<Platform> {
    const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
    const ua = navigator.userAgent;

    if (/android|iphone|ipad|ipod/i.test(ua)) return { os: null, arch: null };

    const source = uaData?.platform || navigator.platform || ua;
    const os: OS | null = /win/i.test(source)
        ? "windows"
        : /mac/i.test(source)
          ? "macos"
          : /linux|x11|cros/i.test(source)
            ? "linux"
            : null;

    let arch: Arch | null = null;
    try {
        const { architecture } = (await uaData?.getHighEntropyValues(["architecture"])) ?? {};
        if (architecture === "arm") arch = "arm64";
        if (architecture === "x86") arch = "x64";
    } catch {}
    if (!arch && /arm64|aarch64/i.test(ua)) arch = "arm64";

    return { os, arch };
}

export function pickAsset(assets: ReleaseAsset[], { os, arch }: Platform): ReleaseAsset | null {
    if (!os) return null;

    const preferredArch = arch ?? (os === "macos" ? "arm64" : "x64");
    const otherArch: Arch = preferredArch === "x64" ? "arm64" : "x64";

    const score = (name: string) => {
        if (archPatterns[preferredArch].test(name)) return 3;
        if (/universal/i.test(name)) return 2;
        if (!archPatterns[otherArch].test(name)) return 1;
        return 0;
    };

    return (
        assets
            .filter(({ name }) => !ignored.test(name) && !/-smart/i.test(name) && osPatterns[os].test(name))
            .sort((a, b) => score(b.name) - score(a.name))[0] ?? null
    );
}

export async function fetchLatestRelease(repo = releasesRepo): Promise<Release | null> {
    const key = `turf-release:${repo}`;
    try {
        const cached = sessionStorage.getItem(key);
        if (cached) return JSON.parse(cached) as Release;
    } catch {}

    try {
        const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
            headers: { Accept: "application/vnd.github+json" },
        });
        if (!response.ok) return null;
        const release = (await response.json()) as Release;
        try {
            sessionStorage.setItem(key, JSON.stringify(release));
        } catch {}
        return release;
    } catch {
        return null;
    }
}
