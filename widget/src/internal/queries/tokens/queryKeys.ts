export const tokenKeys = {
  all: ['tokens'] as const,
  registries: () => [...tokenKeys.all, 'registry'] as const,
  registry: (chainId?: number) =>
    chainId
      ? ([...tokenKeys.registries(), chainId] as const)
      : tokenKeys.registries(),
  prices: () => [...tokenKeys.all, 'price'] as const,
  price: (chainId: number, address: string) =>
    [...tokenKeys.prices(), chainId, address.toLowerCase()] as const,
  relay: (chainId: number) => [...tokenKeys.all, 'relay', chainId] as const,
};
