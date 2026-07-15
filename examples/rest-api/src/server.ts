import express, { type NextFunction, type Request, type Response } from 'express';
import {
  QuoteRequestError,
  QuoteStaleError,
  UnsupportedPairError,
  WalletBlockedError,
} from 'usdm-bridge-sdk';
import { sdk } from './sdk';

const app = express();
app.use(express.json());

// QuoteResponse and friends can carry bigint-ish values; make JSON.stringify
// safe by serializing any bigint as a string.
app.set('json replacer', (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value,
);

// Wrap async handlers so thrown/rejected errors reach the error middleware.
const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Chain + token metadata (handy for building a UI / picking token addresses).
app.get(
  '/chains',
  asyncHandler(async (_req, res) => {
    res.json(await sdk.getChains());
  }),
);

app.get(
  '/tokens',
  asyncHandler(async (req, res) => {
    const chain = req.query.chain as string | undefined;
    res.json(await sdk.getTokens(chain));
  }),
);

// Fetch a quote. The API key stays server-side; the client only sends the pair.
//
// Body: { srcChainId, dstChainId, srcTokenAddress, dstTokenAddress,
//         amount, srcTokenDecimals?, srcWalletAddress, dstWalletAddress? }
app.post(
  '/quote',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const required = [
      'srcChainId',
      'dstChainId',
      'srcTokenAddress',
      'dstTokenAddress',
      'amount',
      'srcWalletAddress',
    ] as const;
    const missing = required.filter((k) => body[k] === undefined || body[k] === null);
    if (missing.length > 0) {
      res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
      return;
    }

    const quote = await sdk.getQuote({
      srcChainId: Number(body.srcChainId),
      dstChainId: Number(body.dstChainId),
      srcTokenAddress: String(body.srcTokenAddress),
      dstTokenAddress: String(body.dstTokenAddress),
      amount: body.amount,
      ...(body.srcTokenDecimals != null ? { srcTokenDecimals: Number(body.srcTokenDecimals) } : {}),
      srcWalletAddress: String(body.srcWalletAddress),
      ...(body.dstWalletAddress != null ? { dstWalletAddress: String(body.dstWalletAddress) } : {}),
    });

    res.json(quote);
  }),
);

// Submit an order the client already signed (browser signs, backend submits so
// the API key never leaves the server). Body: { orderHash, signature }.
app.post(
  '/orders',
  asyncHandler(async (req, res) => {
    const { orderHash, signature } = req.body ?? {};
    if (!orderHash || !signature) {
      res.status(400).json({ error: 'Missing required field(s): orderHash, signature' });
      return;
    }
    res.json(await sdk.submitSwap({ orderHash, signature }));
  }),
);

app.get(
  '/orders/:orderHash/status',
  asyncHandler(async (req, res) => {
    res.json(await sdk.getOrderStatus(req.params.orderHash));
  }),
);

app.get(
  '/orders/:orderHash',
  asyncHandler(async (req, res) => {
    res.json(await sdk.getOrderDetails(req.params.orderHash));
  }),
);

// Central error handler: map known SDK errors to sensible HTTP status codes.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof UnsupportedPairError) {
    res.status(422).json({ error: err.message });
    return;
  }
  if (err instanceof WalletBlockedError) {
    res.status(403).json({ error: err.message });
    return;
  }
  if (err instanceof QuoteStaleError) {
    res.status(409).json({ error: err.message });
    return;
  }
  if (err instanceof QuoteRequestError) {
    res.status(502).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal error';
  console.error(err);
  res.status(500).json({ error: message });
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`usdm-bridge REST API listening on http://localhost:${port}`);
});
