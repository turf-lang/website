import type { APIRoute } from "astro";
import { readFile } from "node:fs/promises";

const name = "install.ps1";
const remote = `https://raw.githubusercontent.com/turf-lang/turf-lang/master/scripts/install/${name}`;

export const GET: APIRoute = async () => {
    let body: string;
    try {
        const response = await fetch(remote);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        body = await response.text();
    } catch (error) {
        console.warn(`[install] could not fetch ${remote} (${error}); using ../turflang/scripts/install/${name}`);
        body = await readFile(new URL(`../../../turflang/scripts/install/${name}`, import.meta.url), "utf8");
    }
    return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
