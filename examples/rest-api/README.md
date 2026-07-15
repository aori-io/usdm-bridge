# usdm-bridge REST API example

A tiny [Express](https://expressjs.com) server that wraps [`usdm-bridge-sdk`](../../sdk) and exposes it over HTTP. It shows the canonical **backend** pattern: your Aori API key stays on the server, and clients hit plain REST endpoints for quoting, submitting, and status tracking.

```
browser / mobile ──HTTP──▶  this API  ──usdm-bridge-sdk──▶  Aori
                            (holds AORI_API_KEY)
```

## Run

```bash
cp .env.example .env   # then set AORI_API_KEY
bun install            # from the repo root; this is a workspace package
bun run --cwd examples/rest-api dev
```

Server starts on `http://localhost:8787` (override with `PORT`).

## Endpoints

| Method | Path                        | SDK call             | Description                          |
| ------ | --------------------------- | -------------------- | ------------------------------------ |
| GET    | `/health`                   | —                    | Liveness check                       |
| GET    | `/chains`                   | `getChains()`        | All Aori-supported chains            |
| GET    | `/tokens?chain=ethereum`    | `getTokens(chain)`   | Token list (optionally per chain)    |
| POST   | `/quote`                    | `getQuote(...)`      | Fetch a quote for a pair             |
| POST   | `/orders`                   | `submitSwap(...)`    | Submit a client-signed order         |
| GET    | `/orders/:orderHash/status` | `getOrderStatus(...)`| Current status of an order           |
| GET    | `/orders/:orderHash`        | `getOrderDetails(...)`| Full order details                  |

### Quote

```bash
curl -s http://localhost:8787/quote \
  -H 'content-type: application/json' \
  -d '{
    "srcChainId": 1,
    "dstChainId": 4326,
    "srcTokenAddress": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "dstTokenAddress": "0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7",
    "amount": "100",
    "srcTokenDecimals": 6,
    "srcWalletAddress": "0xYourAddress"
  }'
```

Pass `amount` as a decimal string/number **with** `srcTokenDecimals`, e.g. `"100"` + `6` for 100 USDC.

### Submit a signed order

Signing needs the user's wallet, so it happens in the browser. The client signs the quote (EIP-712) and posts the result here; the backend forwards it to Aori with the API key attached:

```bash
curl -s http://localhost:8787/orders \
  -H 'content-type: application/json' \
  -d '{ "orderHash": "0x…", "signature": "0x…" }'
```

### Track status

```bash
curl -s http://localhost:8787/orders/0xYOUR_ORDER_HASH/status
```

## Notes

- Only read/quote/submit endpoints are exposed. Actually executing a swap (`sdk.executeSwap` / `sdk.bridge`) needs a wallet to sign, which is a browser concern — this server never holds user keys.
- Errors map to HTTP codes: unsupported pair → `422`, blocked wallet → `403`, stale quote → `409`, upstream quote failure → `502`.
- To lock every quote's output side to USDM on MegaETH, uncomment the `tokens` block in `src/sdk.ts`.
