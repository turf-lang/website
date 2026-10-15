import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { APIRoute, GetStaticPaths } from "astro";
import satori from "satori";
import sharp from "sharp";
import { OG_HEIGHT, OG_WIDTH, getOgPages } from "../../lib/og";

const fontDir = join(process.cwd(), "src", "assets", "fonts");
const fonts = Promise.all([
    readFile(join(fontDir, "GeistPixel-Regular.ttf")),
    readFile(join(fontDir, "HostGrotesk-Regular.ttf")),
    readFile(join(fontDir, "CommitMono-Regular.otf")),
]);

const colors = {
    surface: "#0f1217",
    fg: "#e8ecf2",
    muted: "#91959a",
    accent: "#80a3cb",
};

function titleSize(title: string): number {
    if (title.length <= 18) return 120;
    if (title.length <= 36) return 92;
    if (title.length <= 64) return 72;
    return 56;
}

export const getStaticPaths = (async () => {
    const pages = await getOgPages();
    return [...pages].map(([path, title]) => ({
        params: { path },
        props: { title },
    }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
    const title = props.title as string;
    const [pixel, sans, mono] = await fonts;

    const svg = await satori(
        {
            type: "div",
            props: {
                style: {
                    display: "flex",
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    backgroundColor: colors.surface,
                    color: colors.fg,
                },
                children: [
                    {
                        type: "div",
                        props: {
                            style: {
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                flex: 1,
                                padding: "0 80px",
                            },
                            children: [
                                {
                                    type: "div",
                                    props: {
                                        style: {
                                            fontFamily: "Geist Pixel",
                                            fontSize: titleSize(title),
                                            lineHeight: 1.1,
                                            letterSpacing: "-0.02em",
                                            color: colors.fg,
                                        },
                                        children: title,
                                    },
                                },
                                {
                                    type: "div",
                                    props: {
                                        style: {
                                            fontFamily: "Geist",
                                            fontSize: 44,
                                            marginTop: 32,
                                            color: colors.accent,
                                        },
                                        children: "The Turf Project",
                                    },
                                },
                            ],
                        },
                    },
                    {
                        type: "div",
                        props: {
                            style: {
                                position: "absolute",
                                right: 80,
                                bottom: 64,
                                display: "flex",
                                fontFamily: "Commit Mono",
                                fontSize: 32,
                                color: colors.muted,
                            },
                            children: "turflang.org",
                        },
                    },
                ],
            },
        },
        {
            width: OG_WIDTH,
            height: OG_HEIGHT,
            fonts: [
                {
                    name: "Geist Pixel",
                    data: pixel,
                    weight: 400,
                    style: "normal",
                },
                { name: "Geist", data: sans, weight: 400, style: "normal" },
                {
                    name: "Commit Mono",
                    data: mono,
                    weight: 400,
                    style: "normal",
                },
            ],
        },
    );

    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return new Response(new Uint8Array(png), {
        headers: { "Content-Type": "image/png" },
    });
};
