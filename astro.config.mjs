import { defineConfig } from "astro/config";
import tailwind from "@tailwindcss/vite";
import { turfGrammar } from "./src/lib/shiki/turf-grammar.ts";
import { turfTheme } from "./src/lib/shiki/turf-theme.ts";

import mdx from "@astrojs/mdx";

export default defineConfig({
  site: "https://turflang.org",

  redirects: {
    "/tdp/001": "/tdp/2-001/",
    "/tdp/002": "/tdp/2-002/",
  },

  markdown: {
    shikiConfig: {
      theme: turfTheme,
      langs: [turfGrammar],
    },
  },

  vite: {
    plugins: [tailwind()],
  },

  integrations: [mdx()],
});