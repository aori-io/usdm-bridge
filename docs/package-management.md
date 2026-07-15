# Package management

Build, type-check, version, and publish the two publishable packages
(`usdm-bridge-sdk`, `usdm-bridge-widget`).

## Task runner

All package-management commands go through
[`scripts/pkg.ts`](../scripts/pkg.ts), which takes an explicit target
(`widget`, `sdk`, or `all`) so you can operate on one package or both:

```bash
bun scripts/pkg.ts <command> [target] [-- ...passthroughArgs]
```

| Command      | What it does                                                                      |
| ------------ | --------------------------------------------------------------------------------- |
| `build`      | Build the package(s) with tsup                                                    |
| `dev`        | Watch-build a single package (requires a target)                                  |
| `type-check` | Run `tsc --noEmit`                                                                |
| `lint`       | Run the package `lint` script when it exists                                      |
| `clean`      | Remove each target's `dist/`                                                       |
| `version`    | Bump a single package's version (`version <target> <patch\|minor\|major\|x.y.z>`) |
| `publish`    | Build then `npm publish` the package(s)                                            |

Everything after the first flag or an explicit `--` is passed through to the
underlying tool (e.g. `npm publish` flags).

## Root script shortcuts

The root `package.json` wraps the common cases so you don't have to type the
full `pkg.ts` invocation:

```bash
bun run build            # build both
bun run build:widget     # build only the widget
bun run build:sdk        # build only the SDK
bun run type-check       # type-check both
bun run lint             # lint both

bun run version:sdk minor       # bump the SDK version
bun run version:widget patch    # bump the widget version

bun run publish:sdk             # publish the SDK
bun run publish:widget          # publish the widget
bun run publish:all             # publish both
```

(Example-app scripts like `dev:app` live in
[local-development.md](./local-development.md).)

## Publishing

Both packages publish to the public npm registry
(`publishConfig.access: "public"`).

1. Bump the version: `bun run version:<pkg> <bump>`
2. Dry-run to inspect the tarball: `bun run publish:<pkg> -- --dry-run`
3. Publish: `bun run publish:<pkg>` (requires `npm login` with publish rights)

`publish` always rebuilds the package first, and each package's
`prepublishOnly` runs the build again as a safety net. Only `dist/` is shipped
(see each package's `files` field).

## Notes

- The workspace is defined in the root `package.json` (`widget`, `sdk`,
  `examples/*`). Local packages resolve each other via `workspace:*`.
- `viem` is a **peer** dependency of the SDK and widget (not a devDependency), so
  the monorepo keeps a single hoisted copy. If you add a package that needs viem,
  align it to the same major version to avoid duplicate-copy type conflicts.
