import type { NextApiRequest, NextApiResponse } from 'next';

const RELAY_UPSTREAM = 'https://api.relay.link';

/**
 * Relay API proxy, mirroring the Aori proxy. Forwards `/api/relay/*` to
 * `https://api.relay.link/*`, injecting the optional `RELAY_API_KEY` server-side
 * so it never reaches the client. Relay does not require a key for quoting.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { path } = req.query;
  const segments = Array.isArray(path) ? path.join('/') : path ?? '';
  const queryString = new URL(req.url!, `http://${req.headers.host}`).search;
  const upstreamUrl = `${RELAY_UPSTREAM}/${segments}${queryString}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const apiKey = process.env.RELAY_API_KEY;
  if (apiKey) headers['x-api-key'] = apiKey;

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
