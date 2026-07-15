# Adding a venue to the SDK

The SDK can request quotes from multiple **venues** (liquidity sources / bridges)
in parallel, compare them, and execute + track the one you pick. Aori and
[Relay](https://docs.relay.link) ship in the box. This guide explains the
conventions for adding another.

A venue is any external service that can: (1) quote a cross-chain swap,
(2) execute it with a user's wallet, and (3) report settlement status. If your
service does those three things, it fits the `Venue` contract.

## Mental model

Everything the aggregator does is expressed through one interface,
[`Venue`](../sdk/src/venues/types.ts). The aggregator only ever talks to this
contract, so a new venue is drop-in — no aggregator changes required.

```ts
export interface Venue {
  id: VenueId;
  requestQuote(input: QuoteRequestInput, opts: { signal?: AbortSignal }): Promise<NormalizedQuote>;
  executeQuote(quote: NormalizedQuote, params: ExecuteQuoteParams): Promise<ExecuteQuoteResult>;
  pollStatus(quote: NormalizedQuote, opts: PollAggregatedStatusOptions): Promise<AggregatedStatus>;
}
```

The three methods map to the three lifecycle phases, and each returns a
**normalized** shape so venues stay comparable:

| Phase   | Method          | In                 | Out                  |
| ------- | --------------- | ------------------ | -------------------- |
| Quote   | `requestQuote`  | `QuoteRequestInput`| `NormalizedQuote`    |
| Execute | `executeQuote`  | `NormalizedQuote`  | `ExecuteQuoteResult` |
| Status  | `pollStatus`    | `NormalizedQuote`  | `AggregatedStatus`   |

Each `NormalizedQuote` carries a `venue` id and an opaque `raw` payload. The
aggregator routes execution/status back to the venue that produced the quote, and
that venue reads its own `raw` blob — so venues never need to understand each
other.

> **Note:** venues power the **aggregation** API (`sdk.getQuotes`,
> `getBestQuote`, `executeQuote`, `bridgeQuote`). The single-quote methods
> (`sdk.getQuote`, `executeSwap`, `bridge`) are Aori-specific and are not part of
> the venue abstraction.

## Directory conventions

Each venue lives in its own directory under
[`sdk/src/venues/`](../sdk/src/venues), and the shared contract lives at the top:

```
sdk/src/venues/
├── types.ts          # the Venue contract + all normalized types (shared)
├── aori/
│   └── index.ts      # AoriVenue — a THIN ADAPTER over existing SDK primitives
└── relay/
    ├── index.ts      # RelayVenue class (implements Venue) + public re-exports
    ├── client.ts     # env/config, base-URL resolution, fetch helper, error type
    ├── quotes.ts     # requestQuote body + raw→NormalizedQuote mapping
    ├── execute.ts    # step-machine execution → ExecuteQuoteResult
    ├── status.ts     # status fetch/poll + raw→AggregatedStatus mapping
    ├── types.ts      # venue-native API response types
    ├── chains.ts     # (optional) supported chains / currencies metadata
    └── requests.ts   # (optional) transaction history
```

There are **two shapes a venue can take**, and both are valid:

1. **Thin adapter** (like `aori/`): the venue reuses existing SDK primitives
   (`api/quotes`, `swap/execute`, `api/status`) and only re-shapes I/O to the
   normalized contract. A single `index.ts` is enough.
2. **Self-contained** (like `relay/`): the venue owns its API client and talks to
   a REST API directly. Split it into `client` / `quotes` / `execute` / `status`
   / `types` modules with `index.ts` exporting the class.

**Rules that apply either way:**

- The directory name is the venue id (`aori`, `relay`, …).
- `index.ts` exports a `<Name>Venue` class implementing `Venue`, plus a
  `<Name>VenueOptions` interface.
- Import the shared contract from `../types`.
- Never import another venue's modules. Cross-venue behavior belongs in the
  aggregator, not inside a venue.

## Step-by-step: add `myvenue`

The example below is a self-contained REST venue (the `relay/` pattern). For a
thin adapter, collapse steps 2–5 into a single `index.ts` (see `aori/index.ts`).

### 1. Scaffold the directory

```
sdk/src/venues/myvenue/
├── index.ts
├── client.ts
├── quotes.ts
├── execute.ts
├── status.ts
└── types.ts
```

### 2. `client.ts` — environment, URL policy, fetch helper

Model the API's base URL + key handling. Mirror the proxy/key policy the other
venues use: when `apiBaseUrl` points at an integrator proxy, **omit** the
client-side key (the proxy injects it). See
[`relay/client.ts`](../sdk/src/venues/relay/client.ts) for the reference
`Environment` + `fetch` helper + typed error.

```ts
export const DEFAULT_MYVENUE_API_URL = 'https://api.myvenue.xyz';

export interface MyVenueEnvironmentInit {
  apiBaseUrl?: string;
  apiKey?: string;
}

export class MyVenueEnvironment {
  // getBaseUrl(), getEffectiveApiKey() (undefined when proxied), getHeaders()
}

export class MyVenueApiError extends Error {
  status?: number; // keep the HTTP status — callers branch on it
}

export async function myVenueFetch<T>(env, url, opts): Promise<T> {
  // throws MyVenueApiError on non-2xx
}
```

### 3. `quotes.ts` — request a quote, normalize it

- Normalize the amount: `bigint` = raw units; `string`/`number` = human decimal
  (requires `srcTokenDecimals`, apply `parseUnits`). Copy `normalizeAmount` from
  [`relay/quotes.ts`](../sdk/src/venues/relay/quotes.ts).
- Normalize the native-currency sentinel. Callers may pass the zero address or
  Aori's `0xeeee…eeee`; map both to whatever your API expects.
- Return a [`NormalizedQuote`](../sdk/src/venues/types.ts): set `venue`,
  `quoteId` (your venue-native id), the raw `inputAmount`/`outputAmount` (on-chain
  units), `receivedAt`, and stash the full API response in `raw`. Populate the
  optional comparable fields (`outputAmountUsd`, `estimatedTimeSec`,
  `totalFeeUsd`, `priceImpactPercent`, `expiresAt`) when your API provides them.

> **Units gotcha:** `estimatedTimeSec` must be in **seconds**. Convert if your
> API reports milliseconds (Aori does).

### 4. `execute.ts` — execute a quote, emit normalized steps

Drive the wallet through your venue's execution flow. Reuse the shared wallet
machinery so you honor the integrator's RPC overrides and chain-switch behavior:

- `ChainSwitch` from [`swap/chainSwitch`](../sdk/src/swap/chainSwitch.ts)
- `getPublicClient` from [`swap/publicClients`](../sdk/src/swap/publicClients.ts)
  (receipts / reads, uses `rpcOverrides`)
- `resolveChainId` from [`swap/walletClient`](../sdk/src/swap/walletClient.ts)

Emit a [`QuoteExecutionStep`](../sdk/src/venues/types.ts) via `params.onStep` at
each phase (`chain-switch`, `approval-sent`, `transaction-sent`, `signing`,
`submitted`, `done`) and every tx hash via `params.onTxHash`. Honor
`params.abortSignal`, `skipChainSwitch`, and call `params.validateBeforeSubmit()`
right before the first funding transaction (throw `QuoteStaleError` if it returns
`canSubmit: false`). Return an
[`ExecuteQuoteResult`](../sdk/src/venues/types.ts) (`txHashes`, optional
`signature`, `isNativeDeposit`).

### 5. `status.ts` — poll to a terminal state

Map your API's status strings onto the normalized set
(`pending | received | completed | failed | cancelled`) and implement a poll loop
that resolves on a terminal status, rejects on timeout/abort, and retries
transient errors up to a small budget (order-not-indexed-yet is common right
after a deposit). [`relay/status.ts`](../sdk/src/venues/relay/status.ts) is a
copy-paste-ready template. Return an
[`AggregatedStatus`](../sdk/src/venues/types.ts) with `txHash`/`txUrl` when known.

### 6. `index.ts` — the `Venue` class

```ts
import type { SdkEnvironment } from '../../api/environment';
import type { /* normalized types */ Venue, VenueId } from '../types';
import { MyVenueEnvironment, type MyVenueEnvironmentInit } from './client';
import { requestMyVenueQuote, toNormalizedQuote } from './quotes';
import { executeMyVenueQuote } from './execute';
import { pollMyVenueStatus } from './status';

export interface MyVenueOptions {
  quoteTimeoutMs?: number;
  pollingIntervalMs?: number;
  statusTimeoutMs?: number;
}

export class MyVenue implements Venue {
  readonly id: VenueId = 'myvenue';
  private readonly sdkEnv: SdkEnvironment; // reuse for RPC overrides / public clients
  private readonly venueEnv: MyVenueEnvironment;
  private readonly options: MyVenueOptions;

  constructor(sdkEnv: SdkEnvironment, init: MyVenueEnvironmentInit = {}, options: MyVenueOptions = {}) {
    this.sdkEnv = sdkEnv;
    this.venueEnv = new MyVenueEnvironment(init);
    this.options = options;
  }

  async requestQuote(input, opts) { /* → toNormalizedQuote(...) */ }
  async executeQuote(quote, params) { /* → executeMyVenueQuote(...) */ }
  async pollStatus(quote, opts) { /* → pollMyVenueStatus(...) */ }
}
```

### 7. Add config to `VenuesConfig`

In [`sdk/src/config/types.ts`](../sdk/src/config/types.ts), add a block to
`VenuesConfig`:

```ts
export interface VenuesConfig {
  aori?: { enabled?: boolean };
  relay?: { enabled?: boolean; apiBaseUrl?: string; apiKey?: string };
  myvenue?: { enabled?: boolean; apiBaseUrl?: string; apiKey?: string };
}
```

Convention: opt-in venues default to **off** and are only registered when a
config block is present and `enabled !== false`.

### 8. Register in the SDK

In `getVenueRegistry()` in
[`sdk/src/client/UsdmBridgeSdk.ts`](../sdk/src/client/UsdmBridgeSdk.ts), add:

```ts
const myVenueCfg = venuesCfg?.myvenue;
if (myVenueCfg && myVenueCfg.enabled !== false) {
  registry.set(
    'myvenue',
    new MyVenue(
      this.env,
      {
        ...(myVenueCfg.apiBaseUrl != null ? { apiBaseUrl: myVenueCfg.apiBaseUrl } : {}),
        ...(myVenueCfg.apiKey != null ? { apiKey: myVenueCfg.apiKey } : {}),
      },
      venueOptions, // {quoteTimeoutMs, pollingIntervalMs, statusTimeoutMs} from config.settings
    ),
  );
}
```

`venueOptions` is already assembled from `config.settings` above the Aori
registration — reuse it so every venue honors the same timeout config.

### 9. Export from the public entry point

In [`sdk/src/index.ts`](../sdk/src/index.ts), export the class and its options
(and any history/chain helpers), alongside the existing venue exports:

```ts
export { MyVenue } from './venues/myvenue';
export type { MyVenueOptions } from './venues/myvenue';
```

### 10. (Optional) history + method passthroughs

If your venue can return past transactions, add a `requests.ts` that produces
[`VenueHistoryEntry[]`](../sdk/src/venues/types.ts) and expose a
`queryMyVenueHistory(...)` method on `UsdmBridgeSdk` (see `queryRelayHistory`) so
integrators can build a unified history view. Same for supported
chains/currencies metadata (`chains.ts` → `getRelayChains`/`getRelayCurrencies`).

## Conventions checklist

- [ ] Directory named after the venue id; `index.ts` exports `<Name>Venue` + `<Name>VenueOptions`.
- [ ] Implements `Venue` exactly; imports the contract from `../types`.
- [ ] `NormalizedQuote.raw` holds the full venue-native payload; execution/status read only from it.
- [ ] Amounts normalized to raw on-chain units; `estimatedTimeSec` in seconds.
- [ ] Native-currency sentinel normalized (zero address / `0xeeee…`).
- [ ] Proxy/key policy: no client-side key when `apiBaseUrl` is set.
- [ ] Execution emits normalized `QuoteExecutionStep`s + tx hashes; honors `abortSignal`, `skipChainSwitch`, `validateBeforeSubmit`.
- [ ] Reuses `ChainSwitch` / `getPublicClient` / RPC overrides from `swap/*` — no venue-specific RPC handling.
- [ ] Status mapped to `pending | received | completed | failed | cancelled`; poll loop retries transient errors and resolves on terminal/timeout/abort.
- [ ] No imports from other venues.
- [ ] Config block added to `VenuesConfig`; registered in `getVenueRegistry`; exported from `index.ts`.

## Verify

```bash
bun run build:sdk       # bundle + type declarations
bun run type-check      # tsc across the workspace
```

Then smoke-test through the aggregator:

```ts
const sdk = new UsdmBridgeSdk({ venues: { myvenue: { apiBaseUrl: '/api/myvenue' } } });
const { quotes, errors } = await sdk.getQuotes(input);
// quotes should now include { venue: 'myvenue', ... }
```
