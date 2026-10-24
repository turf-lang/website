import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { APIRoute, GetStaticPaths } from "astro";
import satori from "satori";
import sharp from "sharp";
import { OG_HEIGHT, OG_WIDTH, getOgPages } from "../../lib/og";
import type { OgPage } from "../../lib/og";

const fontDir = join(process.cwd(), "src", "assets", "fonts");
const fonts = Promise.all([
    readFile(join(fontDir, "GeistPixel-Regular.ttf")),
    readFile(join(fontDir, "HostGrotesk-Regular.ttf")),
    readFile(join(fontDir, "CommitMono-Regular.otf")),
]);

const colors = {
    surface: "#0f1217",
    raised: "#161a21",
    fg: "#e8ecf2",
    soft: "rgba(232, 236, 242, 0.78)",
    muted: "rgba(232, 236, 242, 0.56)",
    faint: "rgba(232, 236, 242, 0.36)",
    line: "rgba(232, 236, 242, 0.14)",
    tint: "rgba(232, 236, 242, 0.06)",
    accent: "#80a3cb",
};

type Node = { type: string; props: Record<string, unknown> };

const el = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({
    type,
    props: { style, ...(children === undefined ? {} : { children }) },
});

function titleSize(title: string, hasDescription: boolean): number {
    const length = title.replaceAll("`", "").length;
    if (length <= 14) return hasDescription ? 112 : 132;
    if (length <= 28) return hasDescription ? 88 : 104;
    if (length <= 48) return hasDescription ? 70 : 84;
    if (length <= 72) return hasDescription ? 58 : 68;
    return 48;
}

function renderTitle(title: string, size: number): Node {
    const items: Node[][] = [];
    let glue = false;

    title.split("`").forEach((part, i) => {
        if (i % 2 === 1) {
            const chip = el(
                "div",
                {
                    display: "flex",
                    fontFamily: "Commit Mono",
                    fontSize: size * 0.8,
                    lineHeight: 1,
                    padding: `${size * 0.1}px ${size * 0.2}px`,
                    borderRadius: size * 0.2,
                    border: `2px solid ${colors.line}`,
                    backgroundColor: colors.tint,
                    color: colors.fg,
                },
                part,
            );
            if (glue && items.length > 0) items[items.length - 1].push(chip);
            else items.push([chip]);
            glue = true;
            return;
        }
        const words = part.split(/\s+/);
        const startsGlued = glue && words[0] !== "";
        words.forEach((word, w) => {
            if (word === "") return;
            const node = el("div", { display: "flex" }, word);
            if (w === 0 && startsGlued) items[items.length - 1].push(node);
            else items.push([node]);
        });
        glue = !/\s$/.test(part);
    });

    return el(
        "div",
        {
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: size * 0.28,
            rowGap: size * 0.1,
            fontFamily: "Geist Pixel",
            fontSize: size,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: colors.fg,
        },
        items.map((nodes) => el("div", { display: "flex", alignItems: "center" }, nodes)),
    );
}

function render(page: OgPage): Node {
    const description = page.description?.replaceAll("`", "");
    const size = titleSize(page.title, Boolean(description));

    const header = el("div", { display: "flex", alignItems: "center", justifyContent: "space-between" }, [
        el("div", { display: "flex", fontFamily: "Commit Mono", fontSize: 40, color: colors.fg }, [
            el("div", { display: "flex", color: colors.accent, marginRight: 6 }, ">"),
            el("div", { display: "flex" }, "turf"),
        ]),
        el(
            "div",
            {
                display: "flex",
                fontFamily: "Commit Mono",
                fontSize: 26,
                color: colors.soft,
                padding: "8px 20px",
                borderRadius: 999,
                border: `2px solid ${colors.line}`,
                backgroundColor: colors.tint,
            },
            page.eyebrow,
        ),
    ]);

    const middle = el(
        "div",
        { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", minHeight: 0 },
        [
            renderTitle(page.title, size),
            ...(description
                ? [
                      el(
                          "div",
                          {
                              display: "block",
                              marginTop: 28,
                              maxWidth: 940,
                              fontFamily: "Geist",
                              fontSize: 30,
                              lineHeight: 1.4,
                              color: colors.muted,
                              lineClamp: 2,
                          },
                          description,
                      ),
                  ]
                : []),
        ],
    );

    const footer = el("div", { display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "Commit Mono", fontSize: 26 }, [
        el(
            "div",
            { display: "flex", alignItems: "center", color: colors.soft },
            (page.meta ?? []).flatMap((item, i) => [
                ...(i > 0 ? [el("div", { display: "flex", margin: "0 16px", color: colors.faint }, "·")] : []),
                el("div", { display: "flex" }, item),
            ]),
        ),
        el("div", { display: "flex", color: colors.faint }, "turflang.org"),
    ]);

    return el(
        "div",
        {
            display: "flex",
            boxSizing: "border-box",
            width: "100%",
            height: "100%",
            padding: 36,
            backgroundColor: colors.surface,
            backgroundImage: `radial-gradient(circle at 100% 0%, rgba(128, 163, 203, 0.2), rgba(128, 163, 203, 0) 55%)`,
            color: colors.fg,
        },
        [
            el(
                "div",
                {
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    boxSizing: "border-box",
                    flex: 1,
                    padding: "44px 56px",
                    borderRadius: 32,
                    border: `2px solid ${colors.line}`,
                    backgroundColor: "rgba(22, 26, 33, 0.72)",
                },
                [header, middle, footer],
            ),
        ],
    );
}

export const getStaticPaths = (async () => {
    const pages = await getOgPages();
    return [...pages].map(([path, page]) => ({
        params: { path },
        props: { page },
    }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
    const page = props.page as OgPage;
    const [pixel, sans, mono] = await fonts;

    const svg = await satori(render(page) as never, {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        fonts: [
            { name: "Geist Pixel", data: pixel, weight: 400, style: "normal" },
            { name: "Geist", data: sans, weight: 400, style: "normal" },
            { name: "Commit Mono", data: mono, weight: 400, style: "normal" },
        ],
    });

    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return new Response(new Uint8Array(png), {
        headers: { "Content-Type": "image/png" },
    });
};
