import type { NextApiRequest, NextApiResponse } from 'next';

const AORI_UPSTREAM = 'https://api.aori.io';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { path } = req.query;
  const segments = Array.isArray(path) ? path.join('/') : path ?? '';
  const queryString = new URL(req.url!, `http://${req.headers.host}`).search;
  const upstreamUrl = `${AORI_UPSTREAM}/${segments}${queryString}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // Optional: the Aori API doesn't require a key. If one is configured, forward
  // it; otherwise proxy the request through unauthenticated.
  const apiKey = process.env.AORI_API_KEY;
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
