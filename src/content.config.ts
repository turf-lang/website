import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
    loader: glob({ pattern: ["*.md", "!_*"], base: "./src/content/blog" }),
    schema: z.object({
        title: z.string(),
        description: z.string(),
        date: z.coerce.date(),
        author: z.string(),
        draft: z.boolean().optional(),
    }),
});

const tdp = defineCollection({
    loader: glob({ pattern: ["*.md", "!_*"], base: "./src/content/tdp" }),
    schema: z.object({
        major: z.number().int().min(2),
        number: z.number().int().min(1),
        title: z.string(),
        description: z.string(),
        status: z.enum(["draft", "proposed", "accepted", "implemented", "rejected", "withdrawn"]),
        date: z.coerce.date(),
        updated: z.coerce.date().optional(),
        authors: z.array(z.string()),
        discussion: z.string().url().optional(),
    }),
});

const docs = defineCollection({
    loader: glob({ pattern: ["**/*.{md,mdx}", "!**/_*"], base: "./src/content/docs" }),
    schema: z.object({
        title: z.string(),
        description: z.string(),
        order: z.number().optional(),
        draft: z.boolean().optional(),
        status: z.enum(["stable", "unstable", "placeholder"]).optional(),
        lead: z.string().optional(),
        outcomes: z.array(z.string()).optional(),
    }),
});

const learn = defineCollection({
    loader: glob({ pattern: ["*.mdx", "!_*"], base: "./src/content/learn" }),
    schema: z.object({
        title: z.string(),
        description: z.string(),
        lead: z.string(),
        outcomes: z.array(z.string()),
    }),
});

const stdlib = defineCollection({
    loader: glob({ pattern: ["*.mdx", "!_*"], base: "./src/content/stdlib" }),
    schema: z.object({
        title: z.string(),
        description: z.string(),
        lead: z.string(),
        outcomes: z.array(z.string()),
    }),
});

const resources = defineCollection({
    loader: glob({ pattern: ["*.mdx", "!_*"], base: "./src/content/resources" }),
    schema: z.object({
        title: z.string(),
        description: z.string(),
        lead: z.string(),
        outcomes: z.array(z.string()),
    }),
});

const releases = defineCollection({
    loader: glob({ pattern: ["*.mdx", "!_*"], base: "./src/content/releases" }),
    schema: z.object({
        tag: z.string().regex(/^v\d+\.\d+\.\d+$/),
        title: z.string(),
        description: z.string(),
        date: z.coerce.date(),
        highlights: z.array(z.string()).optional(),
    }),
});

export const collections = { blog, tdp, docs, learn, stdlib, resources, releases };
