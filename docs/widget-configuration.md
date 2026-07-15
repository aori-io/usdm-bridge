# Widget configuration

The embeddable widget (`usdm-bridge-widget`) is driven by a single
`AoriSwapWidgetConfig` object. This is a concise reference; the full type lives in
[`widget/src/config/types.ts`](../widget/src/config/types.ts) and a complete
real-world example in
[`examples/app/aori.config.ts`](../examples/app/aori.config.ts).

## Minimal usage

```tsx
import { SwapWidget, type AoriSwapWidgetConfig } from 'usdm-bridge-widget';
import 'usdm-bridge-widget/styles.css';

const config: AoriSwapWidgetConfig = {
  aoriApiBaseUrl: '/api/aori',                 // proxy — keeps the API key off the client
  walletConnectProjectId: '<your-wc-id>',
  theme: { mode: 'dark' },
  tokens: {
    defaultQuote: { chainId: 4326, address: '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7' }, // USDM MegaETH
    supportedOutputChains: [4326],             // lock the output side to USDM
  },
};

export default function Page() {
  return <SwapWidget config={config} />;
}
```

## Connectivity

| Field                     | Type                              | Notes                                                                                 |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------------------------- |
| `apiKey`                  | `string`                          | Direct Aori API key. Prefer a proxy in production (see `aoriApiBaseUrl`).              |
| `aoriApiBaseUrl`          | `string`                          | Base URL for the Aori API. Use a relative path (`/api/aori`) to proxy server-side; the client-side key is then omitted. |
| `walletConnectProjectId`  | `string`                          | WalletConnect project id for the wallet modal.                                        |
| `rpcOverrides`            | `Record<number, string\|string[]>`| Per-chain RPC URL overrides (allowance reads, receipts, sanctions oracle).            |

## Venues & aggregation

By default the widget is Aori-only. Opt into other venues / aggregation:

| Field                 | Type                                      | Notes                                                                              |
| --------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `venue`               | `VenueId`                                 | Single-venue override (e.g. `'relay'`) to route all quotes through one non-Aori venue. Ignored when `aggregator.enabled`. |
| `aggregator.enabled`  | `boolean`                                 | Request quotes from multiple venues and let the user pick the best.                |
| `aggregator.venues`   | `VenueId[]`                               | Venues to aggregate across. Defaults to `['aori', 'relay']` when Relay is configured. |
| `venues.relay`        | `{ apiBaseUrl?, apiKey? }`                | Relay config. Set `apiBaseUrl` to a proxy to keep the key off the client.          |

See [adding-venues.md](./adding-venues.md) for how venues work under the hood.

## Tokens

Controls which pairs are selectable and the default/locked sides.

| Field                                            | Type                          | Notes                                                       |
| ------------------------------------------------ | ----------------------------- | ----------------------------------------------------------- |
| `defaultBase` / `defaultQuote`                   | `{ chainId, address }`        | Pre-selected input / output token.                          |
| `lockBase` / `lockQuote`                         | `boolean`                     | Prevent the user from changing that side.                   |
| `disableInverting`                               | `boolean`                     | Disable the swap-direction toggle.                          |
| `enabledChains`                                  | `number[]`                    | Restrict selectable chains.                                 |
| `supportedInputTokens` / `supportedOutputTokens` | `{ chainId, address }[]`      | Allow-lists per side (this is how you bind a side to USDM). |
| `unsupportedInputTokens` / `unsupportedOutputTokens` | `{ chainId, address }[]`  | Hide specific tokens (applied after the allow-list).        |
| `supportedInputChains` / `supportedOutputChains` | `number[]`                    | Allow-listed chains per side.                               |
| `prioritizedInputTokens` / `prioritizedInputChains` | `[]`                       | Pin tokens/chains to the top of the selection menu.         |
| `inputSelectionSearch` / `outputSelectionSearch` | `boolean`                     | Show a search box in the asset menu.                        |
| `showInputSelectionTokenBalances` / `showOutputSelectionTokenBalances` | `boolean` | Show balances in the asset menu.                         |

## Appearance & theme

| Field                    | Type                                                | Notes                                                       |
| ------------------------ | --------------------------------------------------- | ----------------------------------------------------------- |
| `theme.mode`             | `'light' \| 'dark'`                                 | Active mode.                                                |
| `theme.light` / `theme.dark` | `WidgetTheme`                                   | CSS-variable overrides (colors, radius, fonts, status colors). |
| `appearance.widgetType`  | `'default' \| 'compact' \| 'horizontal' \| 'split'` | Overall layout.                                             |
| `appearance.*`           | various                                             | Token display, menu variant, amount input, buttons, header, quote loader, `fillContainer`, `hideBorder`, `walletButtonEnabled`. See the type for the full set. |

## Screening, fees, settings

| Field                                | Type                                            | Notes                                                                            |
| ------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `walletScreening.enabled`            | `boolean`                                       | Master toggle (default `true`).                                                  |
| `walletScreening.useChainalysisOracle` | `boolean`                                     | On-chain OFAC SDN check via the free Chainalysis oracle (default `true`).        |
| `walletScreening.screeningUrl`       | `string`                                        | Integrator endpoint: widget GETs `?address=0x…`, expects `{ allowed: boolean }`. |
| `walletScreening.blacklist`          | `string[] \| (addr) => boolean \| Promise<…>`   | Static list or async function, checked first.                                    |
| `integrator`                         | `{ id?, feeRecipient?, feeAmount? }`            | Integrator fee routing.                                                          |
| `settings.defaultSlippage`           | `number`                                        | Default slippage tolerance (e.g. `0.01`).                                        |

## Server-side proxying

In production, keep your Aori (and Relay) API keys and any private RPC URLs off
the client:

- Set `aoriApiBaseUrl` (and `venues.relay.apiBaseUrl`) to your own backend routes
  — the widget stops sending the key from the client and your proxy injects it.
- Point `rpcOverrides` at server routes for read-side RPC calls.

See [`examples/app`](../examples/app) for a working Next.js setup with proxy
routes for the Aori API, Relay API, per-chain RPC, and wallet screening.
