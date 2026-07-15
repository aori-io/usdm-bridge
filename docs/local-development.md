# Local development

How to set up the monorepo, run the examples, and iterate on the packages.

## Prerequisites

- [Bun](https://bun.sh) `>= 1.1` (the repo pins `bun@1.2.17` via `packageManager`)
- Node.js `>= 18` (for running the example apps)

## Setup

Install everything from the repo root. Bun links the local packages into the
examples via the `workspace:*` protocol — there is **no yalc step**.

```bash
bun install
bun run build        # build both publishable packages (sdk + widget)
```

The examples consume `sdk/` and `widget/` through their built `dist/` output, so
build once before running an example for the first time.

## Run an example

Run any example from the repo root — no need to `cd` into a subdirectory (each
example still has its own README for env setup):

```bash
bun run dev:app            # Next.js widget demo (examples/app)
bun run dev:rest-api       # Express SDK REST API (examples/rest-api)
```

### Example scripts

| Script                | Runs                                                                     |
| --------------------- | ------------------------------------------------------------------------ |
| `dev:app`             | `examples/app` dev server (Next.js)                                      |
| `build:app`           | Production build of `examples/app`                                       |
| `start:app`           | Serve the production build of `examples/app`                             |
| `dev:app:full`        | Watch-rebuild the **widget** and run `examples/app` together (parallel)  |
| `dev:rest-api`        | `examples/rest-api` dev server (tsx watch)                               |
| `start:rest-api`      | Run `examples/rest-api` once (no watch)                                  |
| `dev:rest-api:full`   | Watch-rebuild the **SDK** and run `examples/rest-api` together (parallel) |
| `type-check:examples` | Type-check the examples that support it                                  |

## Iterating on the packages

When you edit `sdk/` or `widget/`, the examples only pick up changes after the
package's `dist/` is rebuilt. Two options:

```bash
# Watch a single package in isolation
bun run dev:widget   # watch-rebuild the widget
bun run dev:sdk      # watch-rebuild the SDK
```

```bash
# Recommended: watch the package AND run the example together (one command)
bun run dev:app:full        # widget watcher + examples/app
bun run dev:rest-api:full   # sdk watcher + examples/rest-api
```

The `:full` variants are the tightest local-dev loop — edit the package source
and see it reflected in the running example immediately.

## Before opening a PR

```bash
bun install
bun run build
bun run type-check
```

Keep the SDK headless (no UI/React dependencies) and the widget's public API
stable. Each package has its own README with deeper documentation, and see
[package-management.md](./package-management.md) for build/version/publish tasks.
