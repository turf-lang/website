---
major: 2
number: 17
title: The package registry, publishing and workspaces
description: Add a package registry with semver ranges, a checked `turf publish`, workspaces and generated package documentation, hosted as a static index with no server.
status: draft
date: 2026-10-15
authors:
  - Turf Team
---

## Summary

Turf can depend on a package by path or by git, and it records exact hashes in `turf.lock`, but there is no place to publish a package and no way to say "any compatible 1.x". This proposal adds a registry, workspaces of several packages in one tree, publish checks that enforce semantic versioning by comparing a package's public API with its previous version, and generated package documentation. The registry is a static index in a git repository plus source archives on release storage. Publishing is a pull request that CI checks and merges. There is no server to run.

## Motivation

A language's libraries decide whether people can build real things with it. Turf has the beginnings: path and git dependencies, a lock file with tree hashes, `turf graph`, and a reserved `turf publish`. What is missing:

- **Discovery and naming.** A dependency is a path or a URL, not a name.
- **Version ranges.** Every dependency is pinned exactly, so taking a bug-fix means editing each manifest.
- **A publishing check.** Nothing stops a package from removing a `pub` function in a minor release and breaking everyone.
- **Multi-package projects.** A project of several packages repeats its lock and build directory for each.
- **Documentation.** There is no generated reference for a package's public items.

## Design

### Registry and ranges

A package index maps a name and a version to a source archive and its tree hash. Dependencies use semver ranges:

```toml
[dependencies]
png = "^1.2"
```

The commands:

| Command | Does |
|---|---|
| `turf add <name>` | Adds a dependency with a compatible range |
| `turf update` | Moves locked versions forward within their ranges |
| `turf outdated` | Lists dependencies with newer versions |
| `turf publish` | Publishes a package (see publish checks below) |
| yanking | Marks a version as not to be chosen for new resolutions, without breaking existing locks |

`turf.lock` records each resolved version and its hash, and carries a **format version**, so an older `turf` that meets a newer lock rejects it with a message and never misreads it.

### Hosting

The index is a git repository of small files, one per package, and the source archives live on release storage. A publish is a pull request that adds an index entry. CI checks it and merges it. A sparse HTTP read path may be added later without changing the index format. The index format is a versioned schema with fixtures.

### Workspaces

Several packages live in one tree and share a lock file and a build directory.

```toml
[workspace]
members = ["core", "cli", "tools/*"]
```

### Publish checks

`turf publish` refuses unless:

- the package builds and its tests pass;
- its `pub` API, compared with the previous published version, matches the version bump: removing or changing a `pub` item needs a new major, adding one needs a minor;
- its unsafe-surface report ([TDP-2-018](/tdp/2-018/), safe library interfaces) and `[native]` table ([TDP-2-016](/tdp/2-016/), native code in packages and checked boundaries) are recorded in the index entry.

This is the standard library's API-lock tooling, generalised, so the tool enforces semver and trust is not needed.

### Package documentation

The documentation generator reads `pub` items and doc comments and produces reference pages. The registry shows them, using the same generator as the standard library reference.

### What is published

A published package is a content-hashed **source** tree, Turf and C, plus its manifest. It is built by the consumer with the consumer's compiler. No prebuilt binaries are published, and a Turf-to-Turf binary interface stays unscheduled.

## Constitution check

- **I. Safe by default, unsafe by declaration.** A package's unsafe surface is recorded at publish and shown to the consumer, who must still allow it by name in their manifest.
- **II. Native performance, with costs you can read.** Not affected for compiled programs. Source packages are built with the same optimisation as the rest of the program.
- **III. The compiler is the authority.** Publish checks run the real compiler and the real API comparison. The registry holds no claim the tool has not verified.
- **IV. Nothing crosses a boundary implicitly.** A dependency is named in a manifest, a version is locked with its hash, and unsafe is allowed by name.
- **V. A few general mechanisms, not many special cases.** The existing lock and graph mechanisms are extended, and path, git and registry dependencies share them.
- **VI. It works when you install it.** `turf` has the registry built in, with no server to set up or sign into to read.
- **VII. Stability is a promise.** The lock's format version protects old tools, and the publish check protects consumers from accidental breaks.
- **VIII. A claim is not true until it is demonstrated.** The index is a git history anyone can audit, and the tree hash proves what was downloaded.

The Non-Goals hold. This asks for no borrow checker and no no-runtime targets, and no model is involved in checking or publishing.

## Migration

Nothing breaks. Path and git dependencies keep working. If the manifest or lock format needs a new major, which is not planned, a converter would be provided.

## Verification

- Fixtures for the index schema and the lock format, run in the compiler's CI.
- Tests of range resolution, including conflicts and yanked versions.
- A test that an older `turf` rejects a newer lock with the message.
- A test that publishing a removed `pub` item as a minor is refused.
- A workspace test of two members sharing one lock.
- A rehearsal publish through the whole pull request flow.

## Drawbacks

- A registry needs governance: naming, takedowns and abuse handling, even without a server.
- A pull request per publish is slower than an upload, in exchange for review and no infrastructure.
- Semver checks are only as good as the API comparison, and cannot catch a change in behaviour.

## Alternatives

- **A hosted server with accounts.** Rejected: it adds infrastructure and a security surface.
- **Git dependencies only.** The status quo, without discovery or ranges.
- **Prebuilt binary packages.** Rejected: source keeps the build under the consumer's control.

## Unresolved questions

- Naming rules and how name disputes are settled.
- The retention and mirroring policy for archives.
- How a sparse HTTP read path will be added without changing the index format.
- How registry packages are signed or attested, if at all, in a later proposal.
