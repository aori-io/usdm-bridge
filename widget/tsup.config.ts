import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  clean: true,
  sourcemap: false,
  minify: true,
  noExternal: ['ethereum-gradient-base64'],
  external: [
    'react',
    'react-dom',
    'wagmi',
    'wagmi/chains',
    '@wagmi/core',
    'viem',
    'abitype',
    '@tanstack/react-query',
    'zustand',
    '@aori/aori-ts',
    'usdm-bridge-sdk',
  ],
  banner: { js: '"use client";' },
  splitting: true,
});
