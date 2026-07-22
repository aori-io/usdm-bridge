# usdm-bridge-widget

Embeddable cross-chain swap widget powered by [Aori](https://aori.io).

## Install

```bash
npm install usdm-bridge-widget
# or
yarn add usdm-bridge-widget
# or
bun add usdm-bridge-widget
```

## Peer Dependencies

| Package                         | Version  | Required |
| ------------------------------- | -------- | -------- |
| `wagmi`                         | ^2       | Yes      |
| `@wagmi/core`                   | ^2       | Yes      |
| `viem`                          | ^2       | Yes      |
| `@tanstack/react-query`         | ≥5       | Yes      |
| `zustand`                       | ^4 / ^5  | Yes      |
| `abitype`                       | ≥1       | Optional |

## Quick Start

### 1. Configure the widget

```ts
import type { AoriSwapWidgetConfig } from 'usdm-bridge-widget';

const config: AoriSwapWidgetConfig = {
  aoriApiBaseUrl: '/api/aori',
  walletConnectProjectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
  rpcOverrides: {
    1: '/api/rpc/1',
    10: '/api/rpc/10',
    8453: '/api/rpc/8453',
    42161: '/api/rpc/42161',
    // ...
  },
  theme: {
    mode: 'dark',
    dark: { /* color overrides */ },
    light: { /* color overrides */ },
  },
  // All token/chain fields are optional — omit to allow all supported tokens and chains.
  tokens: {
    defaultBase: { chainId: 1, address: '0x...' },
    defaultQuote: { chainId: 4326, address: '0x...' },
    supportedInputTokens: [
      { chainId: 1, address: '0x...' },
      // ...
    ],
    supportedOutputTokens: [
      { chainId: 4326, address: '0x...' },
      // ...
    ],
    unsupportedInputTokens: [
      { chainId: 4326, address: '0x...' }, // hide a token from the input/base side
    ],
    unsupportedOutputTokens: [
      { chainId: 4326, address: '0x...' }, // hide a token from the output/quote side
    ],
    supportedInputChains: [1, 10, 8453, 42161],
    supportedOutputChains: [4326],
    enabledChains: [1, 10, 56, 143, 4326, 8453, 42161],
    lockBase: false,
    lockQuote: false,
    disableInverting: true,
  },
  appearance: {
    widgetType: 'default',
    tokenDisplay: 'default',
    fillContainer: false,
    hideBorder: true,
    walletButtonEnabled: false,
  },
  settings: {
    defaultSlippage: 0.01,
  },
};
```

### 2. Import styles

```ts
import 'usdm-bridge-widget/styles.css';
```

Add this import once in your app's entry point (e.g. `_app.tsx`, `layout.tsx`, or `main.tsx`). Without it, the widget will render unstyled.

### 3. Render

```tsx
import { SwapWidget } from 'usdm-bridge-widget';
import { ConnectButton, useConnectModal, useAccountModal } from '@rainbow-me/rainbowkit';

export default function App() {
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();

  return (
    <div>
      <ConnectButton />
      <SwapWidget
        config={config}
        customWalletUI="provider"
        onRequestConnect={() => openConnectModal?.()}
        onRequestAccount={() => openAccountModal?.()}
      />
    </div>
  );
}
```

## Wallet Connection

The widget expects your app to provide the wallet context (wagmi, RainbowKit, AppKit, etc.). A typical integration uses `customWalletUI="provider"` with `onRequestConnect` and `onRequestAccount` to wire the widget's connect/account buttons into your existing wallet modals — this is the recommended approach for most integrators.

### Provider (recommended)

Wrap the widget inside your existing wallet provider. Pass `onRequestConnect` and `onRequestAccount` so the widget's built-in buttons open your modals. The widget inherits the wagmi context automatically.

```tsx
import { useConnectModal, useAccountModal } from '@rainbow-me/rainbowkit';

function SwapPage() {
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();

  return (
    <SwapWidget
      config={config}
      customWalletUI="provider"
      onRequestConnect={() => openConnectModal?.()}
      onRequestAccount={() => openAccountModal?.()}
    />
  );
}
```

This works the same way with AppKit or any other wagmi-compatible wallet kit — just swap the modal hooks.



## Chain & RPC Configuration

Your wagmi config **must include all Aori-supported chains** or approvals, wrapping/unwrapping, and chain switching will fail silently.

Import `wagmiChains` and `buildTransports` from the widget package — these provide every supported chain with built-in RPC fallback (multiple public RPCs per chain, tried in order on error or rate-limit).

```ts
import { wagmiChains, buildTransports } from 'usdm-bridge-widget';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { aoriConfig } from './aori.config';

const wagmiConfig = getDefaultConfig({
  appName: 'My App',
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
  chains: wagmiChains,
  transports: buildTransports(aoriConfig.rpcOverrides),
  ssr: false,
});
```

There are two separate RPC paths in the widget:

| Path | Source | Used for |
| --- | --- | --- |
| **Widget internal** | `rpcOverrides` in `AoriSwapWidgetConfig` | Balance fetching, quote pricing |
| **Wagmi** | `buildTransports()` in your wagmi config | Signing, sending txs, chain switching |

`rpcOverrides` in your `aori.config` only affects the widget's internal viem clients. Wagmi transports are configured separately via `buildTransports()` — any URLs passed there are **client-side JavaScript** and will be visible in the browser. Never pass private RPC URLs directly to `buildTransports`.

To keep private RPCs server-side for both paths, use the same relative proxy paths (e.g. `/api/rpc/1`) in your `rpcOverrides` and pass them to `buildTransports` as shown above. The browser hits your API route, which forwards to the real RPC with credentials from environment variables. See [Server-Side Proxying](#server-side-proxying) for how to set up the proxy routes.

## Server-Side Proxying

In production you almost certainly want to keep your API key **and** private RPC URLs off the client. The widget supports this via two config fields: `aoriApiBaseUrl` and `rpcOverrides`. Both accept relative paths that hit your own backend routes, which then forward requests upstream with the real credentials attached.

### API Key Proxy (`aoriApiBaseUrl`)

Instead of passing `apiKey` in the client config, point `aoriApiBaseUrl` at your own API route. The widget will send all quote/swap/status requests there instead of directly to the Aori API.

**Widget config:**

```ts
const config: AoriSwapWidgetConfig = {
  aoriApiBaseUrl: '/api/aori',
  // no apiKey needed — the server injects it
  // ...
};
```

**Next.js API route** (`pages/api/aori/[...path].ts`):

```ts
import type { NextApiRequest, NextApiResponse } from 'next';

const AORI_UPSTREAM = 'https://api.aori.io';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { path } = req.query;
  const segments = Array.isArray(path) ? path.join('/') : path ?? '';
  const queryString = new URL(req.url!, `http://${req.headers.host}`).search;
  const upstreamUrl = `${AORI_UPSTREAM}/${segments}${queryString}`;

  const apiKey = process.env.AORI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'AORI_API_KEY not configured' });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
  };

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
  });

  const contentType = upstream.headers.get('content-type') ?? 'application/json';
  res.setHeader('Content-Type', contentType);
  res.status(upstream.status);

  const body = await upstream.text();
  res.send(body);
}
```

Then set `AORI_API_KEY` in your `.env` (or hosting provider's environment variables):

```
AORI_API_KEY=your_aori_api_key
```

### Private RPC Proxy (`rpcOverrides`)

The same pattern works for RPC endpoints. Point each chain's override at a local route that forwards JSON-RPC requests to your private RPC, keeping the URL and any auth tokens server-side.

**Widget config:**

```ts
const config: AoriSwapWidgetConfig = {
  aoriApiBaseUrl: '/api/aori',
  rpcOverrides: {
    1: '/api/rpc/1',
    10: '/api/rpc/10',
    56: '/api/rpc/56',
    8453: '/api/rpc/8453',
    42161: '/api/rpc/42161',
    143: '/api/rpc/143',
    4326: '/api/rpc/4326',
  },
  // ...
};
```

**Next.js API route** (`pages/api/rpc/[chainId].ts`):

```ts
import type { NextApiRequest, NextApiResponse } from 'next';

const RPC_URLS: Record<string, string | undefined> = {
  '1': process.env.ETHEREUM_RPC_URL,
  '10': process.env.OPTIMISM_RPC_URL,
  '56': process.env.BSC_RPC_URL,
  '8453': process.env.BASE_RPC_URL,
  '42161': process.env.ARBITRUM_RPC_URL,
  '143': process.env.MONAD_RPC_URL,
  '4326': process.env.MEGAETH_RPC_URL,
};

function jsonRpcError(res: NextApiResponse, id: unknown, code: number, message: string) {
  return res.status(200).json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const chainId = req.query.chainId as string;
  const rpcUrl = RPC_URLS[chainId];

  if (!rpcUrl) {
    return jsonRpcError(res, null, -32603, `RPC not configured for chain ${chainId}`);
  }

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(await response.json());
  } catch (error) {
    return jsonRpcError(res, null, -32603, error instanceof Error ? error.message : 'RPC request failed');
  }
}
```

**.env:**

```
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_KEY
BSC_RPC_URL=https://bsc-mainnet.g.alchemy.com/v2/YOUR_KEY
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
MONAD_RPC_URL=https://your-monad-rpc.example.com
MEGAETH_RPC_URL=https://your-megaeth-rpc.example.com
```

> **Not using Next.js?** The same approach works with any backend — Express, Fastify, Cloudflare Workers, etc. The proxy just needs to forward the request body upstream and return the response. The widget doesn't care what's behind the route as long as it speaks the same protocol (REST for the Aori API, JSON-RPC for RPCs).

## Aggregator Mode (multiple venues)

The widget can act as an **aggregator**: request quotes from multiple venues
(**Aori** and **[Relay](https://docs.relay.link)**), show the best one, let the
user pick, and execute against the selected venue. This is fully additive — with
no aggregator config the widget behaves exactly as before (Aori-only).

### Enable it

```ts
const config: AoriSwapWidgetConfig = {
  aoriApiBaseUrl: '/api/aori',
  // Turn on the aggregator and list the venues to quote across:
  aggregator: { enabled: true, venues: ['aori', 'relay'] },
  // Relay venue config — proxy the API like Aori (key optional):
  venues: { relay: { apiBaseUrl: '/api/relay' } },
  theme: { mode: 'dark' },
  // ... tokens, rpcOverrides, etc.
};
```

When enabled, the swap form renders a **quote list** between the amount input and
the swap button: the top 2 quotes (best-first, with a "Best" badge), a
**"More quotes"** expander, per-venue loading skeletons, and per-venue error rows
(e.g. "Relay: no route"). Selecting a row pins that venue; the swap button then
executes the selected quote via the correct venue (Aori RFQ or Relay's
step-based flow). `onSwapSubmitted` / `onSwapComplete` fire with the selected
quote's id, exactly as in single-venue mode.

### Single-venue override

To route everything through one non-Aori venue without the aggregator UI:

```ts
const config: AoriSwapWidgetConfig = {
  venue: 'relay',
  venues: { relay: { apiBaseUrl: '/api/relay' } },
  // ...
};
```

### Relay API proxy

Mirror the Aori proxy for Relay so the (optional) key stays server-side. A
Next.js route (`pages/api/relay/[...path].ts`):

```ts
import type { NextApiRequest, NextApiResponse } from 'next';

const RELAY_UPSTREAM = 'https://api.relay.link';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { path } = req.query;
  const segments = Array.isArray(path) ? path.join('/') : path ?? '';
  const queryString = new URL(req.url!, `http://${req.headers.host}`).search;
  const upstreamUrl = `${RELAY_UPSTREAM}/${segments}${queryString}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = process.env.RELAY_API_KEY; // optional
  if (apiKey) headers['x-api-key'] = apiKey;

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
  });

  res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
  res.status(upstream.status);
  res.send(await upstream.text());
}
```

### Custom token sources (bring your own token list)

Populate the asset picker from your own token source in addition to (or instead
of) the built-in venue lists (Aori/Relay). Pass `tokens.sources` — it maps
straight through to the SDK's `tokens.sources`.

```ts
const config: AoriSwapWidgetConfig = {
  // ...
  tokens: {
    sources: [
      // Your token API. Set `searchable: true` if it searches server-side —
      // the picker will route search-as-you-type to it (incl. tokens not in
      // the preloaded list).
      {
        id: 'my-token-api',
        type: 'custom',
        searchable: true,
        getTokens: async ({ chainId, term, signal }) => {
          const res = await fetch('/api/my-tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chainId, term }),
            ...(signal ? { signal } : {}),
          });
          return res.json(); // TokenMetadata[]
        },
      },
      // Or a hosted token-list JSON, or a static inline array:
      // { id: 'my-list', type: 'tokenlist', url: 'https://.../list.json' },
      // { id: 'house', type: 'static', tokens: [/* ... */] },
    ],
    sourcePriority: ['my-token-api', 'aori', 'relay'], // first wins on collisions
    replaceVenueTokens: false, // true = show ONLY your sources' tokens
  },
};
```

A custom-source token shows in the picker but is only **quotable** if a real
venue (Aori/Relay) supports the pair. Existing `supportedInputTokens` /
`unsupportedInputTokens` whitelists/blocklists still apply on top.

> **Relay endpoint gotcha:** hit the public API `https://api.relay.link`
> (`POST /currencies/v2`), or proxy it as shown above. `https://relay.link/api/relay/...`
> is Relay's own website proxy and returns `403 Forbidden` for third parties.

### Advanced: building your own aggregator UI

The provider, hook, and UI pieces are exported for custom experiences:

```tsx
import { QuotesProvider, useQuotes, QuoteList } from 'usdm-bridge-widget';
import type { NormalizedQuote, VenueId } from 'usdm-bridge-widget';

function Custom() {
  const { quotes, selectedQuote, setSelectedQuote, status } = useQuotes();
  // render your own list, or drop in <QuoteList />
}
```

The public `SwapWidget` API is unchanged; these are additive advanced exports.

## Props

| Prop                 | Type                                     | Default        | Description                                      |
| -------------------- | ---------------------------------------- | -------------- | ------------------------------------------------ |
| `config`             | `AoriSwapWidgetConfig`                   | —              | Widget configuration (required)                  |
| `customWalletUI`     | `'none' \| 'provider'`                  | `'provider'`   | `'provider'` wires into your wallet modals via callbacks; `'none'` hides all wallet UI |
| `onRequestConnect`   | `() => void`                             | —              | Open the host app's connect modal                |
| `onRequestAccount`   | `() => void`                             | —              | Open the host app's account modal                |
| `onSwapSubmitted`    | `(orderHash: string) => void`            | —              | Fires immediately after the user's signing/transaction steps complete and the order is submitted to the Aori backend. The value is the Aori `orderHash` for tracking. |
| `onSwapComplete`     | `(data: SwapCompleteData) => void`       | —              | Fires when polling confirms the swap is settled on-chain. Returns `{ quoteId, aoriOrderHash, explorerUrl, details }` where `details` is the full Aori `/data/details` response. |
| `onBlockedWallet`    | `(data: BlockedWalletEvent) => void`     | —              | Fires after wallet screening completes. Returns `{ address, allowed, source? }` where `source` is `'chainalysis-oracle'` or `'screening-url'` (present when blocked). |
| `onBaseTokenChange`  | `(token: Asset) => void`                 | —              | Callback when the base token changes             |
| `onQuoteTokenChange` | `(token: Asset) => void`                 | —              | Callback when the quote token changes            |
| `className`          | `string`                                 | —              | Additional CSS class on the root element         |

### Swap Lifecycle Hooks Example

Use `onSwapSubmitted` to know when the order hits the Aori backend, and `onSwapComplete` to get the full details once it settles on-chain:

```tsx
<SwapWidget
  config={aoriConfig}
  onSwapSubmitted={(quoteId) => {
    // Fires immediately after the user signs and the order is submitted.
    // quoteId is the Aori orderHash — use it to track the order or just wait for onSwapComplete.
  }}
  onSwapComplete={({ aoriOrderHash, explorerUrl, details }) => {
    // Fires when polling confirms the swap is settled on-chain.
    // details is the full response from https://api.aori.io/data/details/${aoriOrderHash}

    // Redirect to a confirmation page
    router.push(`/confirmation?order=${aoriOrderHash}`);

    // Or persist to your own tx history
    const getEventTime = (type: string) =>
      details.events.find(e => e.event === type)?.timestamp ?? null;

    addToHistory({
      orderHash: aoriOrderHash,
      explorerUrl,
      inputAmount: details.inputAmount,
      inputChain: details.inputChain,
      outputAmount: details.outputAmount,
      outputChain: details.outputChain,
      srcTx: details.srcTx,
      dstTx: details.dstTx,
      // individual event timestamps — use these to show status progression in your UI
      createdAt:   getEventTime('created'),
      receivedAt:  getEventTime('received'),
      completedAt: getEventTime('completed'),
      failedAt:    getEventTime('failed'),
      canceledAt: getEventTime('cancelled'),
    });
  }}
/>
```

The `SwapCompleteData` type:

```ts
interface SwapCompleteData {
  quoteId: string;        // Aori orderHash (same value as onSwapSubmitted)
  aoriOrderHash: string;  // Aori order hash, parsed from explorerUrl
  explorerUrl: string;    // https://aoriscan.io/order/0x...
  details: AoriOrderDetails;
}

interface AoriOrderDetails {
  orderHash: string;
  offerer: string;
  recipient: string;
  inputToken: string;
  inputAmount: string;
  inputChain: string;
  inputTokenValueUsd: string;
  outputToken: string;
  outputAmount: string;
  outputChain: string;
  outputTokenValueUsd: string;
  startTime: number;
  endTime: number;
  timestamp: number;
  srcTx: string | null;
  dstTx: string | null;
  events: Array<{
    event: string;   // 'created' | 'received' | 'completed' | 'failed' | 'cancelled'
    timestamp: number;
  }>;
}
```

### What You Can Build With These Hooks

The data from `onSwapComplete` is generic — you decide what to do with it. Some examples:

- **Tx history component** — render a live list of swaps with status, amounts, and links
- **Confirmation page** — redirect to a dedicated page after settlement with order details
- **Custom notification** — show a toast, modal, or banner with the swap result
- **Analytics** — send swap events to your own backend or analytics pipeline
- **Order detail page** — use `aoriOrderHash` to link to or render a full order breakdown
- **Just the data** — store it in state, context, or your DB and use it however your app needs

The hooks don't dictate any UI. They hand you the data at the right moment — you wire it into whatever component or flow makes sense for your app.

### Building a Live Tx History

One common pattern — use both hooks together to maintain a live list. `onSwapSubmitted` adds a pending entry immediately, `onSwapComplete` updates it in-place once settled:

```tsx
const [history, setHistory] = useState([]);

const addOrUpdate = (quoteId, patch) =>
  setHistory(prev => {
    const exists = prev.find(e => e.quoteId === quoteId);
    if (exists) return prev.map(e => e.quoteId === quoteId ? { ...e, ...patch } : e);
    return [...prev, { quoteId, status: 'pending', orderHash: null, ...patch }];
  });

<SwapWidget
  config={aoriConfig}
  onSwapSubmitted={(quoteId) => {
    addOrUpdate(quoteId, { status: 'pending' });
  }}
  onSwapComplete={({ quoteId, aoriOrderHash, explorerUrl, details }) => {
    const getEventTime = (type) =>
      details.events.find(e => e.event === type)?.timestamp ?? null;

    addOrUpdate(quoteId, {
      status: getEventTime('failed') ? 'failed' : 'completed',
      orderHash: aoriOrderHash,
      explorerUrl,
      inputAmount: details.inputAmount,
      inputChain: details.inputChain,
      outputAmount: details.outputAmount,
      outputChain: details.outputChain,
      srcTx: details.srcTx,
      dstTx: details.dstTx,
      createdAt:   getEventTime('created'),
      receivedAt:  getEventTime('received'),
      completedAt: getEventTime('completed'),
      failedAt:    getEventTime('failed'),
    });
  }}
/>

// Render history however you like
{history.map(tx => <TxRow key={tx.quoteId} tx={tx} />)}
```

This gives you a real-time list that:
- Shows "pending" the instant the user submits
- Updates to "completed" or "failed" once on-chain settlement confirms
- Has all the data needed to render amounts, chains, tx links, and a status timeline

### Fetching Order History Outside the Hook

The `onSwapComplete` hook only captures swaps from the current session. To load a wallet's full order history — on mount, for a tx history page, etc. — use the Aori API directly with the connected wallet address.

**Query all orders for a wallet** ([`/data/query`](https://docs.aori.io/reference/query)):

```ts
const res = await fetch(
  `https://api.aori.io/data/query?offerer=[connected_wallet_address]&page=0&limit=100&sortBy=createdAt_desc`
);
const { orders, pagination } = await res.json();
// orders is an array of summarised order objects with srcTx, dstTx, amounts, chains, status
```

**Get full details for a specific order** ([`/data/details`](https://docs.aori.io/reference/details)):

```ts
const res = await fetch(`https://api.aori.io/data/details/${orderHash}`);
const details = await res.json();
// Full event history, tx hashes, block numbers, timestamps
```

The recommended pattern for a tx history feature:

- **On swap completion** — write to your own state/DB via `onSwapComplete`
- **On page load** — fetch historical orders from `/data/query?offerer=${address}` to backfill swaps from past sessions
- **On detail view** — fetch `/data/details/${orderHash}` for the full event timeline of a specific order

## Configuration

See [`AoriSwapWidgetConfig`](./src/config/types.ts) for the full type. Only non-default values need to be specified.

| Section | Type | Description |
| --- | --- | --- |
| `theme` | `{ mode, light?, dark? }` | Active color mode and optional light/dark theme overrides. Each theme controls colors, border radius, fonts, and shadows. |
| `tokens` | `{ defaultBase?, defaultQuote?, lockBase?, lockQuote?, enabledChains?, disableInverting?, supportedInputTokens?, supportedOutputTokens?, unsupportedInputTokens?, unsupportedOutputTokens?, sources?, sourcePriority?, replaceVenueTokens? }` | Default token pair, enabled chains, lock/invert settings, per-side token whitelists/blocklists, and **custom token sources**. All fields optional. `unsupportedInputTokens`/`unsupportedOutputTokens` hide specific tokens from the asset menu (applied after the whitelist; flips with the whitelist on invert). `sources` adds integrator token lists (your API / hosted list / static array) to the picker; `sourcePriority` sets merge order; `replaceVenueTokens` shows only your sources' tokens. See [Custom token sources](#custom-token-sources-bring-your-own-token-list). |
| `appearance` | `{ widgetType?, tokenDisplay?, assetMenuVariant?, swapButtonVariant?, ... }` | Layout variant (`default`, `compact`, `horizontal`, `split`), token display style, asset menu variant, quote loader, and other UI options. |
| `settings` | `{ defaultSlippage? }` | Default slippage tolerance. |
| `integrator` | `{ id?, feeRecipient?, feeAmount? }` | Integrator ID, fee recipient address, and fee amount for revenue attribution. |
| `aoriApiBaseUrl` | `string` | Base URL for the Aori API. Use a relative path (e.g. `'/api/aori'`) to proxy through your server and keep the API key off the client. |
| `rpcOverrides` | `Record<number, string \| string[]>` | Override RPCs for the widget's internal viem clients. Accepts direct URLs or relative paths to your own proxy routes. |
| `walletScreening` | `{ enabled?, useChainalysisOracle?, screeningUrl?, blacklist? }` | Wallet screening / sanctions compliance. See [Wallet Screening](#wallet-screening). |

### Wallet Screening

The widget includes built-in wallet screening to check connecting addresses against sanctions lists. Screening runs automatically when a wallet connects. If the address is flagged, the widget disables all inputs, stops quoting, and replaces the swap button with a blocked banner.

There are two layers:

| Layer | What it does | Config | Default |
| --- | --- | --- | --- |
| **Layer 1** — Chainalysis Oracle | Calls the [Chainalysis Sanctions Oracle](https://go.chainalysis.com/chainalysis-oracle-docs.html) smart contract on Ethereum mainnet. Checks the address against the OFAC SDN list. Free, no API key, no backend required. | `useChainalysisOracle` | `true` |
| **Layer 2** — Custom screening endpoint | Calls an integrator-provided server route with `GET ?address=0x...`, expects `{ allowed: boolean }`. Use this to add TRM Labs, Chainalysis Screening API, or your own compliance backend. | `screeningUrl` | `undefined` (off) |

Both layers run in sequence when configured. If either flags the address, the widget locks down.

#### Config Reference

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Master toggle for all screening. Set `false` to disable everything. |
| `blacklist` | `string[] \| (address: string) => boolean \| Promise<boolean>` | `undefined` | Blacklist. Static array of addresses or async function to grab addresses from external/internal datasource. Checked before Layer 1/2 — if matched, skips all other checks. |
| `useChainalysisOracle` | `boolean` | `true` | Layer 1. Calls the on-chain Chainalysis oracle. |
| `screeningUrl` | `string` | `undefined` | Layer 2. URL to your server-side screening endpoint. |

#### Blacklist

The `blacklist` field lets you block specific addresses without relying on Layer 1/2. It runs first — if the address is blacklisted, Layer 1 and Layer 2 are never called.

**Static list** — hardcode addresses directly in the config:

```ts
walletScreening: {
  blacklist: [
    '0x26da3963613301798251427fB5b93d6fC7cB75D8',
    '0x607aE55107457f6645149cd66ED5D220fBEB2F96',
  ],
},
```

**Async function** — check against your own database or any external data source:

The function receives the wallet address and must return `true` (blocked) or `false` (allowed). How you determine that is entirely up to you — query a database, call an API, read a file, whatever. The widget only cares about the boolean you return.

```ts
walletScreening: {
  blacklist: async (address) => {
    // Call your own backend route — the response shape is yours to define
    const res = await fetch(`/api/blacklist?address=${address}`);
    const data = await res.json();

    // Map whatever field your API returns to a boolean:
    //   data.blocked, data.flagged, data.is_sanctioned, data.status === 'denied', etc.
    return Boolean(data.blocked);
  },
},
```

The widget doesn't know or care what backs your route. Here are three real-world patterns for the server side — each returns a JSON response with whatever field name you choose, and the config function maps it to a boolean:

**PostgreSQL**

```ts
// pages/api/blacklist.ts (or any backend route)
import { pool } from '@/lib/db';

export default async function handler(req, res) {
  const { address } = req.query;
  const { rows } = await pool.query(
    'SELECT is_blocked FROM accounts WHERE LOWER(address) = LOWER($1)',
    [address],
  );
  // Your table might use "is_blocked", "flagged", "sanctioned", etc.
  return res.json({ blocked: rows[0]?.is_blocked ?? false });
}
```

**REST / internal compliance API**

```ts
export default async function handler(req, res) {
  const { address } = req.query;
  const upstream = await fetch(
    `https://internal-api.example.com/compliance/check?address=${address}`,
    { headers: { Authorization: `Bearer ${process.env.COMPLIANCE_KEY}` } },
  );
  const data = await upstream.json();
  // The upstream API might return { flagged: true } or { status: "denied" }
  // — just map it to your response shape
  return res.json({ blocked: data.flagged });
}
```

**JSON file (lightweight / testing)**

```ts
import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const { address } = req.query;
  const db = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'data', 'blacklist.json'), 'utf-8'),
  );
  const entry = db.find((e) => e.address.toLowerCase() === address.toLowerCase());
  return res.json({ blocked: entry?.blocked ?? false });
}
```

The key point: your server route normalizes whatever your datasource returns into a consistent response, and your config function reads that response and returns a boolean. The field names, table schemas, and API shapes are all yours.

**Combined** — mix static addresses with a dynamic source in one function:

```ts
const hardcoded = ['0x26da...', '0x607a...'];

walletScreening: {
  blacklist: async (address) => {
    if (hardcoded.some((a) => a.toLowerCase() === address.toLowerCase())) return true;
    const res = await fetch(`/api/blacklist?address=${address}`);
    const data = await res.json();
    return data.blocked;
  },
},
```

#### Screening Examples

**Most integrators — Layer 1 runs automatically, nothing to set:**

```ts
export const aoriConfig: AoriSwapWidgetConfig = {
  aoriApiBaseUrl: '/api/aori',
  rpcOverrides: { 1: '/api/rpc/1', /* ... */ },
  theme: { mode: 'dark' },
  // walletScreening is not set — Layer 1 (Chainalysis oracle) is on by default.
  // No config needed. The oracle check runs automatically when a wallet connects.
};
```

**Explicitly enabling Layer 1 (same behavior as above, just explicit):**

```ts
export const aoriConfig: AoriSwapWidgetConfig = {
  aoriApiBaseUrl: '/api/aori',
  rpcOverrides: { 1: '/api/rpc/1', /* ... */ },
  theme: { mode: 'dark' },
  walletScreening: {
    enabled: true,
    useChainalysisOracle: true,
  },
};
```

**Layer 1 + Layer 2 (oracle + your own screening server):**

```ts
export const aoriConfig: AoriSwapWidgetConfig = {
  aoriApiBaseUrl: '/api/aori',
  rpcOverrides: { 1: '/api/rpc/1', /* ... */ },
  theme: { mode: 'dark' },
  walletScreening: {
    // Layer 1 still runs (default true)
    screeningUrl: '/api/screen-wallet', // Layer 2 — your server route
  },
};
```

**Layer 2 only (disable the oracle, use only your own screening):**

```ts
export const aoriConfig: AoriSwapWidgetConfig = {
  aoriApiBaseUrl: '/api/aori',
  rpcOverrides: { 1: '/api/rpc/1', /* ... */ },
  theme: { mode: 'dark' },
  walletScreening: {
    useChainalysisOracle: false,       // Layer 1 off
    screeningUrl: '/api/screen-wallet', // Layer 2 only
  },
};
```

**Disable all screening:**

```ts
export const aoriConfig: AoriSwapWidgetConfig = {
  aoriApiBaseUrl: '/api/aori',
  rpcOverrides: { 1: '/api/rpc/1', /* ... */ },
  theme: { mode: 'dark' },
  walletScreening: {
    enabled: false, // No screening at all
  },
};
```

#### Layer 2 Server Route

When `screeningUrl` is set, the widget sends `GET <screeningUrl>?address=0x...` when a wallet connects. Your server must return JSON:

```json
{ "allowed": true }
```

or:

```json
{ "allowed": false }
```

Your server route handles the actual compliance logic — TRM Labs, Chainalysis Screening API, a database lookup, a static blocklist, whatever. The widget doesn't know or care what's behind the URL. This follows the same pattern as `aoriApiBaseUrl` and `rpcOverrides` — set a relative path in the config, build a server route that handles it.

**Example Next.js API route using the free Chainalysis Sanctions Screening API** (`pages/api/screen-wallet.ts`):

```ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const address = req.query.address as string | undefined;
  if (!address) {
    return res.status(400).json({ error: 'Missing address query param' });
  }

  const apiKey = process.env.CHAINALYSIS_API_KEY;
  if (!apiKey) {
    console.error('CHAINALYSIS_API_KEY not set');
    return res.status(200).json({ allowed: true }); // fail open
  }

  try {
    const response = await fetch(
      `https://public.chainalysis.com/api/v1/address/${address}`,
      { headers: { 'X-API-Key': apiKey, Accept: 'application/json' } },
    );

    if (!response.ok) {
      console.error(`Chainalysis API error: ${response.status}`);
      return res.status(200).json({ allowed: true }); // fail open
    }

    const data: { identifications: unknown[] } = await response.json();
    return res.status(200).json({ allowed: data.identifications.length === 0 });
  } catch (error) {
    console.error('Chainalysis API request failed:', error);
    return res.status(200).json({ allowed: true }); // fail open
  }
}
```

You can replace the Chainalysis call with any provider/internal service you use fro wallet screening (TRM Labs, Elliptic, a static blocklist, etc.) — the widget only cares that the route returns `{ allowed: boolean }`.

#### How it works

1. User connects wallet (wagmi `useAccount`).
2. **Blacklist** (if `blacklist` is set): Checked first. If the address matches the static list or the async function returns `true`, the wallet is blocked immediately — Layer 1 and Layer 2 are skipped.
3. **Layer 1** (if `useChainalysisOracle` is not `false`): Widget calls `isSanctioned(address)` on the Chainalysis oracle contract. The oracle covers all EVM addresses regardless of which chain the user is swapping on.
4. **Layer 2** (if `screeningUrl` is set): Widget calls `GET <screeningUrl>?address=0x...` and reads the `allowed` field from the JSON response.
5. If any check flags the address: all inputs are disabled, quoting stops, and the swap button is replaced with a blocked banner. The widget is fully inert.
6. If a clean wallet connects (or the user switches accounts to a clean wallet), the widget returns to normal.

#### `onBlockedWallet` Callback

The `onBlockedWallet` prop fires once after screening completes for a connected address. Use it for compliance logging, custom UI, audit trails, or to force-disconnect blocked wallets.

```tsx
import { SwapWidget, type BlockedWalletEvent } from 'usdm-bridge-widget';

<SwapWidget
  config={aoriConfig}
  onBlockedWallet={({ address, allowed, source }) => {
    if (!allowed) {
      // source is 'blacklist', 'chainalysis-oracle' (Layer 1), or 'screening-url' (Layer 2)
      console.warn(`Blocked wallet: ${address} (flagged by ${source})`);
      analytics.track('wallet_blocked', { address, source });
    }
  }}
/>
```

Results are cached in-memory for 1 hour per address, so tab-switching, remounting `<SwapWidget>`, or rendering it multiple times won't re-trigger network calls.

#### `useWalletScreening` Hook

Read screening state anywhere inside the widget tree:

```tsx
import { useWalletScreening } from 'usdm-bridge-widget';

function Banner() {
  const { status, isBlocked, address, source } = useWalletScreening();
  if (status === 'checking') return <p>Verifying wallet…</p>;
  if (isBlocked) return <p>{address} blocked by {source}.</p>;
  return null;
}
```

Returns `{ status, isBlocked, address, source }` — `source` is `'blacklist' | 'chainalysis-oracle' | 'screening-url' | null`.

#### Hoisting `<WalletScreeningProvider>`

If you need `useWalletScreening` outside the widget tree (e.g. in a header or Tab or sibling component), wrap your app with the provider directly. When hoisted, the `walletScreening` config and `onBlockedWallet` props on `<SwapWidget>` are ignored — the outer provider owns both.

```tsx
import { WalletScreeningProvider, SwapWidget } from 'usdm-bridge-widget';

<WalletScreeningProvider config={aoriConfig.walletScreening} onBlockedWallet={log}>
  <Header />
  <Tabs>
    <Tab id="bridge"><SwapWidget config={aoriConfig} /></Tab>
    <Tab id="other"><OtherView /></Tab>
  </Tabs>
</WalletScreeningProvider>
```

#### Headless `screenWallet`

Exported for server-side use (API routes, middleware). Doesn't share the in-widget cache — add your own if needed.

```ts
import { screenWallet } from 'usdm-bridge-widget';

const { allowed, source } = await screenWallet(address, { useChainalysisOracle: true });
```

### Invertible Token Lists

When `disableInverting` is `false` (or omitted), users can flip the swap direction using the invert button. When they do, `supportedInputTokens` and `supportedOutputTokens` swap sides — meaning token list A becomes the output whitelist and token list B becomes the input whitelist.

This enables **bidirectional bridge** configurations with a single config. For example, a USDM stablecoin bridge:

```ts
tokens: {
  supportedInputTokens: [
    { chainId: 1, address: '0x...' },     // USDC Ethereum
    { chainId: 8453, address: '0x...' },   // USDC Base
    { chainId: 42161, address: '0x...' },  // USDC Arbitrum
    // ... other stablecoins
  ],
  supportedOutputTokens: [
    { chainId: 4326, address: '0x...' },   // USDM MegaETH
  ],
  supportedInputChains: [1, 8453, 42161],
  supportedOutputChains: [4326],
  disableInverting: false,
  lockBase: false,
  lockQuote: false,
}
```

In the default direction, the user picks a stablecoin as input and receives USDM. After inverting, the lists flip — USDM becomes the only input option and the stablecoins become the output options.

**Dynamic locking:** When a side's effective token list contains exactly one token, that side's token selection is automatically disabled and the dropdown icon is hidden. No need to set `lockBase` or `lockQuote` — locking is inferred from the list length and updates dynamically on invert.

Set `disableInverting: true` to prevent flipping and keep the lists fixed to their configured sides.

### Token Blocklists

Use `unsupportedInputTokens` and `unsupportedOutputTokens` to hide specific tokens from the asset selection menu without enumerating every supported token. Useful when you want the default registry behavior (all supported tokens listed) but need to exclude one or two for legal/compliance/business reasons.

```ts
tokens: {
  unsupportedInputTokens: [
    { chainId: 4326, address: '0x...' }, // hide MEGA from the input/base side
  ],
  unsupportedOutputTokens: [
    { chainId: 4326, address: '0x...' }, // hide MEGA from the output/quote side
  ],
}
```

**Order of operations:** registry → `supportedInputTokens` / `supportedOutputTokens` whitelist → `unsupportedInputTokens` / `unsupportedOutputTokens` blocklist → asset menu. The blocklist applies on top of the whitelist (or on top of the full registry when no whitelist is set), so a blocked token is hidden whether or not you also use the whitelist.

**Invert behavior:** When `disableInverting: false` and the user flips the swap, `unsupportedInputTokens` ↔ `unsupportedOutputTokens` swap together — same as `supportedInputTokens` ↔ `supportedOutputTokens`. A token blocked from the input side stays blocked when that side becomes the output after inversion only if you list it in both `unsupportedInputTokens` and `unsupportedOutputTokens`.

## Display Patterns

The widget is a standard React component — place it anywhere in your layout.

### Inline (default)

```tsx
<SwapWidget config={config} />
```

### Modal / Dialog

```tsx
const [open, setOpen] = useState(false);

return (
  <>
    <button onClick={() => setOpen(true)}>Swap</button>
    {open && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        onClick={() => setOpen(false)}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <SwapWidget config={config} />
        </div>
      </div>
    )}
  </>
);
```

### Drawer / Slide-in

```tsx
const [open, setOpen] = useState(false);

return (
  <>
    <button onClick={() => setOpen(true)}>Swap</button>
    <div
      className={`fixed top-0 right-0 z-50 h-full w-[420px] bg-background shadow-xl
        transition-transform duration-300
        ${open ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <button onClick={() => setOpen(false)}>Close</button>
      <SwapWidget config={config} />
    </div>
    {open && (
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={() => setOpen(false)}
      />
    )}
  </>
);
```

These are minimal examples. In production, use your app's existing modal/drawer components (Radix, shadcn, Headless UI, etc.) for accessibility and consistent behavior.

## Resources

- [Full Documentation](https://docs.aori.io)
- [Widget API Reference](https://docs.aori.io/swap-widget)
- [GitHub](https://github.com/aori-io)

## License

[MIT](./LICENSE)
