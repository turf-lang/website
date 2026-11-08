## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Error pages

`src/content/docs/errors/` is generated: never edit a page there. It comes from
`src/data/diagnostic-registry.json`, the compiler's diagnostic registry
(`share/turf/diagnostic-registry.json` in a release archive, or
`turfc --registry-json`). After a release, copy the archive's file there and run
`pnpm errors` (`node scripts/convert-errors.mjs [--registry <file>]`).
`pnpm build` runs `convert-errors.mjs --check` first and fails on a page that is
stale, missing, or names a code the registry does not have.
