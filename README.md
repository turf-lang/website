# Turf website

The source of the website for [Turf](https://github.com/turf-lang/turflang), a compiled, memory-safe systems programming language. It holds the home page, the download page, the Learn course, the documentation, the standard library reference, the blog and the Turf Design Proposals.

Built with [Astro](https://astro.build), Tailwind CSS and MDX. The output is plain static files.

## Running it

You need Node 22.12 or newer and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm dev
```

The site is then at `http://localhost:4321`. `pnpm build` writes the finished site to `dist/`, and `pnpm preview` serves it.

## Writing

All the writing is in `src/content/`, one folder for each part of the site: `blog`, `learn`, `docs`, `stdlib`, `resources` and `tdp`. A page is a Markdown or MDX file with a short block of front matter at the top. A new blog post is just a new file in `src/content/blog/`:

```md
---
title: Your title
description: One sentence about the post.
date: 2026-10-15
author: Your Name
---

The post starts here.
```

The fields each page needs are listed in `src/content.config.ts`, and the build tells you if one is missing or wrong.

## Contributing

Fixes and improvements are welcome, from a typo to a whole new guide. Open an issue or a pull request, and run `pnpm build` first to make sure the site still compiles.
