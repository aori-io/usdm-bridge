# USDM Bridge

Monorepo for the **USDM bridge** — a cross-chain bridge for USDM powered by Aori and the
LayerZero Value Transfer (VT) API. It contains two publishable packages plus a set of
example integrations, managed as a single [Bun](https://bun.sh) workspace.

## Packages

| Path      | Package name         | Description                                                                       | Published |
| --------- | -------------------- | --------------------------------------------------------------------------------- | --------- |
| `sdk/`    | `usdm-bridge-sdk`    | Headless TypeScript SDK for the VT API — quote, swap, and status tracking, no UI. | ✅ npm     |
| `widget/` | `usdm-bridge-widget` | Embeddable React/Next.js cross-chain swap widget.                                 | ✅ npm     |

## Repository layout

```javascript
usdm-bridge/
├── sdk/                     # usdm-bridge-sdk  (publishable)
├── widget/                  # usdm-bridge-widget (publishable)
├── examples/                # example integrations (private, not published)
│   ├── app/                 # Next.js app embedding the widget
│   └── rest-api/            # Express REST API wrapping the SDK (server-side)
├── docs/                    # guides (see Documentation below)
├── scripts/
│   └── pkg.ts               # monorepo task runner (build/publish/etc.)
└── package.json             # workspace root
```

## Documentation

| Guide                                                | What it covers                                              |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| [Local development](./docs/local-development.md)     | Setup, running examples, iterating on the packages          |
| [Package management](./docs/package-management.md)   | Build, type-check, version, and publish tasks               |
| [Widget configuration](./docs/widget-configuration.md) | The `AoriSwapWidgetConfig` reference                      |
| [Adding a venue](./docs/adding-venues.md)            | Integrating additional liquidity venues into the SDK        |

Each publishable package also has its own README with deeper API docs:
[`sdk/`](./sdk/README.md) · [`widget/`](./widget/README.md).

## Quick start

Requires [Bun](https://bun.sh) `>= 1.1` (the repo pins `bun@1.2.17`) and Node.js `>= 18`.

```bash
bun install
bun run build        # build both publishable packages
bun run dev:app      # run the Next.js widget demo
```

See [Local development](./docs/local-development.md) for the full setup, all
example scripts, and the watch-based dev loop.

## Contributing

Contributions are welcome. Before opening a PR, run
`bun install && bun run build && bun run type-check` (CI runs the same checks on
every PR). Keep the SDK headless (no UI/React dependencies) and the widget's
public API stable. See [Local development](./docs/local-development.md) and
[Package management](./docs/package-management.md) for details.

## License

[MIT](./LICENSE)
