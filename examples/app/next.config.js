const path = require('path');

// The widget is a workspace package whose peer deps (wagmi/viem/react/etc.)
// bun installs as separate physical copies. Without deduping, the widget and
// the app load different wagmi instances -> two WagmiProvider React contexts
// -> WagmiProviderNotFoundError. Alias every shared singleton to the app copy.
const dedupe = ['wagmi', '@wagmi/core', 'viem', 'react', 'react-dom', '@tanstack/react-query'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    config.resolve.alias = config.resolve.alias || {};
    for (const pkg of dedupe) {
      try {
        config.resolve.alias[pkg] = path.dirname(
          require.resolve(`${pkg}/package.json`, { paths: [__dirname] }),
        );
      } catch {}
    }
    return config;
  },
};

module.exports = nextConfig;
