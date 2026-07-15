import { UsdmBridgeSdk, type UsdmBridgeConfig } from 'usdm-bridge-sdk';

// On a backend the Aori API key lives in env and never touches the browser.
const apiKey = process.env.AORI_API_KEY;
if (!apiKey) {
  throw new Error('AORI_API_KEY is not set. Copy .env.example to .env and fill it in.');
}

export const config: UsdmBridgeConfig = {
  apiKey,
  settings: {
    quoteTimeoutMs: 15_000,
    pollingIntervalMs: 4_000,
    statusTimeoutMs: 300_000,
  },

  // To turn this into a strict "USDM bridge" API, bind the output side of every
  // pair to USDM on MegaETH. `getQuote` then rejects anything else with
  // `UnsupportedPairError` (mapped to HTTP 422 below).
  //
  // tokens: {
  //   defaultQuote: { chainId: 4326, address: '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7' },
  //   supportedOutputTokens: [{ chainId: 4326, address: '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7' }],
  //   supportedOutputChains: [4326],
  // },
};

export const sdk = new UsdmBridgeSdk(config);
