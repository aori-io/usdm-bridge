'use client';

import { useSwapFormContext } from '../providers/SwapFormProvider';
import { useWidgetSwapUIStore } from '../stores/swapUIStore';
import type { Asset, SupportedChainId, TokenSelectCategory } from '../internal/types';
import { getAvailableChainConfigs, isGasToken } from '../internal/chainsConfig';
import { checkedAddress, calculateDollarizedBalance } from '../internal/helpers';
import { useDebounce } from '../internal/hooks/useDebounce';
import { useSupportedTokensWithPricing, useTokenData } from '../internal/queries/tokens/hooks';
import { useBulkBalances } from '../internal/queries/balances/hooks';
import TokenImage from '../internal/components/TokenImage';
import ChainIcon from '../internal/components/ChainIcon';
import { useWalletState } from '../wallet/useWalletState';
import { useWidgetConfig } from '../context/WidgetConfigContext';
import { useEnabledChainIds } from '../hooks/useEnabledChainIds';
import { useEffectiveTokenConfig } from '../hooks/useEffectiveTokenConfig';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AssetSelectionBalanceItem } from './AssetSelectionBalanceItem';

const USDM_CHAIN_ID = 4326;
const ONE_TO_ONE_USDC_CHAINS = new Set([1, 10, 143, 8453, 42161]);

function isOneToOnePair(
  side: 'base' | 'quote',
  otherAsset: Asset | null,
  token: { symbol?: string; chainId: number },
): boolean {
  if (side !== 'base' || !otherAsset) return false;
  if (otherAsset.chainId !== USDM_CHAIN_ID || otherAsset.symbol?.toUpperCase() !== 'USDM') return false;
  return token.symbol?.toUpperCase() === 'USDC' && ONE_TO_ONE_USDC_CHAINS.has(token.chainId);
}

const OneToOneBadge = () => (
  <span
    className="inline-flex items-center px-1.5 py-0.5 text-2xs font-bold uppercase shrink-0"
    style={{
      backgroundColor: 'var(--widget-primary)',
      color: 'var(--widget-primary-foreground)',
      borderRadius: '4px',
      lineHeight: 1,
    }}
  >
    1:1
  </span>
);

interface AssetSelectionMenuProps {
  toggle: () => void;
  side: 'base' | 'quote';
  otherAsset: Asset | null;
  containerHeight?: string;
  onChainHover?: (chainName: string | null) => void;
  onMoreChainsClick?: () => void;
  selectedChainFilter?: SupportedChainId | null;
}

const AssetSelectionMenu: React.FC<AssetSelectionMenuProps> = ({
  toggle,
  side,
  otherAsset,
  containerHeight,
  onChainHover,
  onMoreChainsClick,
  selectedChainFilter,
}) => {
  const { address: userAddress } = useWalletState();

  const {
    assetSelectionSearch: searchQuery,
    assetSelectionChain: selectedChain,
    assetSelectionCategory: categoryState,
    recentChainIds,
  } = useWidgetSwapUIStore(
    useShallow((state) => ({
      assetSelectionSearch: state.assetSelectionSearch,
      assetSelectionChain: state.assetSelectionChain,
      assetSelectionCategory: state.assetSelectionCategory,
      recentChainIds: state.recentChainIds,
    })),
  );

  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const availableChainIds = useEnabledChainIds();
  const { inputSelectionSearch, outputSelectionSearch, showInputSelectionTokenBalances, showOutputSelectionTokenBalances } = useWidgetConfig();
  const { effectiveInputTokens, effectiveOutputTokens, effectiveUnsupportedInputTokens, effectiveUnsupportedOutputTokens, effectiveInputChains, effectiveOutputChains, effectivePrioritizedInputTokens, effectivePrioritizedInputChains } = useEffectiveTokenConfig();
  const showSearch = side === 'base' ? inputSelectionSearch : outputSelectionSearch;
  const showBalances = side === 'base' ? showInputSelectionTokenBalances : showOutputSelectionTokenBalances;
  const { setBaseToken, setQuoteToken } = useSwapFormContext();

  const sideTokens = side === 'base' ? effectiveInputTokens : effectiveOutputTokens;
  const sideUnsupportedTokens = side === 'base' ? effectiveUnsupportedInputTokens : effectiveUnsupportedOutputTokens;
  const sideChains = side === 'base' ? effectiveInputChains : effectiveOutputChains;
  const sidePrioritizedTokens = side === 'base' ? effectivePrioritizedInputTokens : [];
  const sidePrioritizedChains = side === 'base' ? effectivePrioritizedInputChains : [];
  const hideChainsBar = sideChains.length === 1;

  const supportedTokensSet = useMemo(() => {
    if (sideTokens.length === 0) return null;
    const s = new Set<string>();
    for (const t of sideTokens) {
      s.add(`${t.chainId}-${t.address.toLowerCase()}`);
    }
    return s;
  }, [sideTokens]);

  const unsupportedTokensSet = useMemo(() => {
    if (sideUnsupportedTokens.length === 0) return null;
    const s = new Set<string>();
    for (const t of sideUnsupportedTokens) {
      s.add(`${t.chainId}-${t.address.toLowerCase()}`);
    }
    return s;
  }, [sideUnsupportedTokens]);

  useEffect(() => {
    if (hideChainsBar) {
      useWidgetSwapUIStore.getState().setAssetSelectionChain(sideChains[0] as SupportedChainId);
    } else if (selectedChainFilter) {
      useWidgetSwapUIStore.getState().setAssetSelectionChain(selectedChainFilter);
    }
  }, [selectedChainFilter, hideChainsBar, sideChains]);

  const DISPLAY_CHAINS = React.useMemo(() => {
    const maxDisplayChains = 5;
    const sideChainSet = sideChains.length > 0 ? new Set(sideChains) : null;
    const availableChains = getAvailableChainConfigs(availableChainIds)
      .filter((c) => !sideChainSet || sideChainSet.has(c.id))
      .map((c) => ({ chainId: c.id, name: c.displayName }));
    const chainMap = new Map(availableChains.map((c) => [c.chainId, c]));
    const prioritizedSet = new Set(sidePrioritizedChains);
    const nonPrioritizedRecent = recentChainIds.filter(
      (id) => !prioritizedSet.has(id as number) && chainMap.has(id as number),
    );
    const slotsForRecent = Math.min(nonPrioritizedRecent.length, maxDisplayChains);
    const prioritizedSlots = maxDisplayChains - slotsForRecent;
    const result: typeof availableChains = [];
    const used = new Set<number>();
    for (const chainId of sidePrioritizedChains) {
      if (result.length >= prioritizedSlots) break;
      const chain = chainMap.get(chainId);
      if (chain && !used.has(chainId)) { result.push(chain); used.add(chainId); }
    }
    for (const recentId of nonPrioritizedRecent) {
      if (result.length >= maxDisplayChains) break;
      const chain = chainMap.get(recentId as number);
      if (chain && !used.has(recentId as number)) { result.push(chain); used.add(recentId as number); }
    }
    for (const chainId of sidePrioritizedChains) {
      if (result.length >= maxDisplayChains) break;
      if (used.has(chainId)) continue;
      const chain = chainMap.get(chainId);
      if (chain) { result.push(chain); used.add(chainId); }
    }
    for (const chain of availableChains) {
      if (result.length >= maxDisplayChains) break;
      if (used.has(chain.chainId)) continue;
      result.push(chain);
    }
    return result;
  }, [availableChainIds, recentChainIds, sideChains, sidePrioritizedChains]);

  const { enrichedTokens, isLoading } = useSupportedTokensWithPricing(
    selectedChain === 'all' ? 'all' : selectedChain,
  );
  const { tokenRegistry, getToken } = useTokenData();

  const registrySet = useMemo(() => {
    const s = new Set<string>();
    for (const t of tokenRegistry) {
      s.add(`${t.chainId}-${t.address.toLowerCase()}`);
    }
    return s;
  }, [tokenRegistry]);

  const whitelistedTokens = useMemo(() => {
    if (!supportedTokensSet) return enrichedTokens;
    return enrichedTokens.filter((t) =>
      supportedTokensSet.has(`${t.chainId}-${t.address.toLowerCase()}`),
    );
  }, [enrichedTokens, supportedTokensSet]);

  const allowedTokens = useMemo(() => {
    if (!unsupportedTokensSet) return whitelistedTokens;
    return whitelistedTokens.filter(
      (t) => !unsupportedTokensSet.has(`${t.chainId}-${t.address.toLowerCase()}`),
    );
  }, [whitelistedTokens, unsupportedTokensSet]);

  const filteredTokens = useMemo(() => {
    if (!otherAsset) return allowedTokens;
    return allowedTokens.filter(
      (t) => !(t.chainId === otherAsset.chainId && t.address.toLowerCase() === otherAsset.address.toLowerCase()),
    );
  }, [allowedTokens, otherAsset]);

  const tokenList = React.useMemo(() => {
    if (!debouncedSearchQuery) return filteredTokens;
    const query = debouncedSearchQuery.toLowerCase();
    return filteredTokens.filter(
      (token) =>
        (token.symbol || '').toLowerCase().includes(query) ||
        (token.name || '').toLowerCase().includes(query) ||
        token.address.toLowerCase().includes(query),
    );
  }, [filteredTokens, debouncedSearchQuery]);

  const prioritizedTokenIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < sidePrioritizedTokens.length; i++) {
      const t = sidePrioritizedTokens[i];
      m.set(`${t.chainId}-${t.address.toLowerCase()}`, i);
    }
    return m;
  }, [sidePrioritizedTokens]);

  const sortedTokens = React.useMemo(() => {
    const raw = selectedChain === 'all'
      ? (tokenList || []).filter((t) => availableChainIds.includes(t.chainId))
      : (tokenList || []);
    const seen = new Set<string>();
    const base = raw.filter((t) => {
      const k = `${t.chainId}-${t.address.toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return [...base].sort((a, b) => {
      const aKey = `${a.chainId}-${a.address.toLowerCase()}`;
      const bKey = `${b.chainId}-${b.address.toLowerCase()}`;
      const aIdx = prioritizedTokenIndexMap.get(aKey);
      const bIdx = prioritizedTokenIndexMap.get(bKey);
      if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
      if (aIdx !== undefined) return -1;
      if (bIdx !== undefined) return 1;
      const isAGas = isGasToken(a);
      const isBGas = isGasToken(b);
      if (isAGas && !isBGas) return -1;
      if (!isAGas && isBGas) return 1;
      return 0;
    });
  }, [tokenList, selectedChain, availableChainIds, prioritizedTokenIndexMap]);

  const { balances: walletBalancesData, isLoading: isWalletBalanceLoading } =
    useBulkBalances(userAddress, availableChainIds, undefined, sideTokens.length > 0 ? sideTokens : undefined);

  const balancesForChain = React.useMemo(() => {
    if (!walletBalancesData) return [];
    const filtered = selectedChain === 'all' ? walletBalancesData : walletBalancesData.filter((b) => b.chainId === selectedChain);
    const seen = new Set<string>();
    return filtered.filter((b) => {
      const k = `${b.chainId}-${(b.address || '').toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [walletBalancesData, selectedChain]);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value.toLowerCase();
    const addressInput = checkedAddress(query);
    const store = useWidgetSwapUIStore.getState();
    if (addressInput) {
      store.setAssetSelectionSearch(addressInput);
      store.setAssetSelectionAddressInput(addressInput);
    } else {
      store.setAssetSelectionAddressInput('');
      store.setAssetSelectionSearch(query);
    }
  }, []);

  const handleFormSelection = useCallback(
    async (asset: Asset) => {
      if (side === 'base') await setBaseToken(asset);
      else if (side === 'quote') await setQuoteToken(asset);
      toggle();
    },
    [toggle, side, setBaseToken, setQuoteToken],
  );

  return (
    <div className="w-full h-full flex flex-col pt-1">
      {!hideChainsBar && (
        <div className="flex flex-row justify-between py-1 flex-shrink-0 h-10">
          <button
            type="button"
            className="flex flex-row items-center w-full h-full px-2.5 whitespace-nowrap font-bold uppercase text-xs cursor-pointer text-center justify-center"
            style={{
              backgroundColor: selectedChain === 'all' && !selectedChainFilter ? 'var(--widget-primary)' : 'var(--widget-secondary)',
              color: selectedChain === 'all' && !selectedChainFilter ? 'var(--widget-primary-foreground)' : 'var(--widget-secondary-foreground)',
              border: '1px solid var(--widget-border)',
              borderRadius: 'var(--widget-radius) 0 0 var(--widget-radius)',
            }}
            onClick={(e) => { e.stopPropagation(); useWidgetSwapUIStore.getState().setAssetSelectionChain('all'); }}
            onMouseEnter={() => onChainHover?.('All Chains')}
            onMouseLeave={() => onChainHover?.(null)}
          >
            All
          </button>
          {DISPLAY_CHAINS.map((chain, index) => (
            <button
              key={chain.chainId}
              type="button"
              className="flex items-center justify-center px-2 w-full cursor-pointer"
              style={{
                backgroundColor: selectedChain === chain.chainId ? 'var(--widget-primary)' : 'var(--widget-secondary)',
                color: selectedChain === chain.chainId ? 'var(--widget-primary-foreground)' : 'var(--widget-secondary-foreground)',
                borderTop: '1px solid var(--widget-border)',
                borderBottom: '1px solid var(--widget-border)',
                borderLeft: index === 0 ? 'none' : '1px solid var(--widget-border)',
                borderRight: '1px solid var(--widget-border)',
              }}
              onClick={(e) => {
                e.stopPropagation();
                useWidgetSwapUIStore.getState().setAssetSelectionChain(chain.chainId as SupportedChainId);
              }}
              onMouseEnter={() => onChainHover?.(chain.name)}
              onMouseLeave={() => onChainHover?.(null)}
            >
              <div className="mb-px h-4 w-4">
                <ChainIcon chain={chain.chainId} size="xs" />
              </div>
            </button>
          ))}
          {onMoreChainsClick && (
            <button
              type="button"
              className="flex flex-row cursor-pointer items-center w-full h-full px-2.5 whitespace-nowrap uppercase font-bold text-xs"
              style={{ backgroundColor: 'var(--widget-secondary)', color: 'var(--widget-secondary-foreground)', border: '1px solid var(--widget-border)', borderRadius: '0 var(--widget-radius) var(--widget-radius) 0' }}
              onClick={(e) => { e.stopPropagation(); onMoreChainsClick(); }}
            >
              More
            </button>
          )}
        </div>
      )}

      {showSearch && (
        <div className="flex-shrink-0">
          <div className="relative mt-1">
            <input
              className="w-full h-10 px-4 text-sm"
              style={{ backgroundColor: 'var(--widget-card)', color: 'var(--widget-card-foreground)', border: '1px solid var(--widget-border)' }}
              placeholder="Search tokens by name, symbol, or address..."
              autoComplete="off"
              value={searchQuery}
              onChange={handleSearch}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => useWidgetSwapUIStore.getState().setAssetSelectionSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-full px-2 py-1 text-xs"
                style={{
                  backgroundColor: 'var(--widget-secondary)',
                  color: 'var(--widget-secondary-foreground)',
                  border: '1px solid var(--widget-border)',
                }}
              >
                clear
              </button>
            )}
          </div>
        </div>
      )}

      <div
        className="flex-1 min-h-0 overflow-auto mt-2"
        style={{ backgroundColor: 'var(--widget-background)' }}
      >
        {showBalances && isWalletBalanceLoading && !searchQuery && categoryState === 'all' && (
          <div>
            <p className="my-1 ml-4 text-xs" style={{ color: 'var(--widget-muted-foreground)' }}>Your Tokens</p>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="w-full flex items-center justify-between p-3"
                style={{ borderBottom: '1px solid var(--widget-border)' }}
              >
                <div className="flex items-center space-x-3 min-w-0 flex-1">
                  <div
                    className="h-8 w-8 flex-shrink-0 animate-pulse"
                    style={{ backgroundColor: 'var(--widget-secondary)', borderRadius: '9999px' }}
                  />
                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <div
                      className="h-3.5 w-16 animate-pulse"
                      style={{ backgroundColor: 'var(--widget-secondary)', borderRadius: '0.25rem' }}
                    />
                    <div
                      className="h-3 w-24 animate-pulse"
                      style={{ backgroundColor: 'var(--widget-secondary)', opacity: 0.6, borderRadius: '0.25rem' }}
                    />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <div
                    className="h-3.5 w-14 animate-pulse"
                    style={{ backgroundColor: 'var(--widget-secondary)', borderRadius: '0.25rem' }}
                  />
                  <div
                    className="h-3 w-10 animate-pulse"
                    style={{ backgroundColor: 'var(--widget-secondary)', opacity: 0.5, borderRadius: '0.25rem' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {showBalances && !isWalletBalanceLoading && balancesForChain.length > 0 && !searchQuery && categoryState === 'all' && (
          <div>
            <p className="my-1 ml-4 text-xs" style={{ color: 'var(--widget-muted-foreground)' }}>Your Tokens</p>
            {balancesForChain
              .filter((a) => {
                if (!a.assetInfo) return false;
                if (otherAsset && a.assetInfo.chainId === otherAsset.chainId &&
                    a.assetInfo.address.toLowerCase() === otherAsset.address.toLowerCase()) return false;
                const key = `${a.assetInfo.chainId}-${a.assetInfo.address.toLowerCase()}`;
                if (unsupportedTokensSet?.has(key)) return false;
                if (supportedTokensSet) {
                  return supportedTokensSet.has(key);
                }
                return isGasToken(a.assetInfo) || registrySet.has(key);
              })
              .sort((a, b) => {
                const aKey = `${a.chainId}-${(a.address || '').toLowerCase()}`;
                const bKey = `${b.chainId}-${(b.address || '').toLowerCase()}`;
                const aIdx = prioritizedTokenIndexMap.get(aKey);
                const bIdx = prioritizedTokenIndexMap.get(bKey);
                if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
                if (aIdx !== undefined) return -1;
                if (bIdx !== undefined) return 1;
                const aToken = getToken(a.chainId, a.address) || a.assetInfo;
                const bToken = getToken(b.chainId, b.address) || b.assetInfo;
                const aVal = aToken && a.decimals !== undefined ? calculateDollarizedBalance(aToken, a.balance, a.decimals) : 0;
                const bVal = bToken && b.decimals !== undefined ? calculateDollarizedBalance(bToken, b.balance, b.decimals) : 0;
                return bVal - aVal;
              })
              .map((asset) => {
                if (!asset.assetInfo || !otherAsset) return null;
                return (
                  <AssetSelectionBalanceItem
                    key={`${asset.assetInfo.chainId}-${asset.assetInfo.address}`}
                    asset={asset}
                    otherAsset={otherAsset}
                    handleFormSelection={handleFormSelection}
                    getToken={getToken}
                    showOneToOne={isOneToOnePair(side, otherAsset, asset.assetInfo)}
                  />
                );
              })}
          </div>
        )}

        <p className="my-2 ml-4 text-xs" style={{ color: 'var(--widget-muted-foreground)' }}>
          {searchQuery ? 'Search Results' : 'Supported Tokens'}
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <span style={{ color: 'var(--widget-muted-foreground)' }}>Loading tokens...</span>
          </div>
        ) : sortedTokens.length === 0 ? (
          <div className="px-4 py-3 text-sm" style={{ color: 'var(--widget-muted-foreground)' }}>Token Not Found</div>
        ) : (
          sortedTokens.map((token) => (
            <div
              key={`${token.chainId}-${token.address}`}
              role="button"
              tabIndex={0}
              className="w-full flex items-center justify-between p-3 cursor-pointer"
              style={{ borderBottom: '1px solid var(--widget-border)' }}
              onClick={() => handleFormSelection(token)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleFormSelection(token); } }}
            >
              <div className="flex items-center space-x-3 min-w-0 flex-1">
                <TokenImage asset={token} size="sm" className="flex-shrink-0" />
                <div className="flex flex-col items-start min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-thin truncate" style={{ color: 'var(--widget-secondary-foreground)' }}>
                    {(token.symbol || '').length > 20 ? `${token.symbol.substring(0, 20)}...` : (token.symbol || '—')}
                    {isOneToOnePair(side, otherAsset, token) && <OneToOneBadge />}
                  </span>
                  <span className="text-xs truncate" style={{ color: 'var(--widget-muted-foreground)' }}>
                    {(token.name || '').length > 20 ? `${token.name.substring(0, 20)}...` : (token.name || '—')}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end text-right flex-shrink-0">
                <span className="text-xs font-sans" style={{ color: 'var(--widget-muted-foreground)' }}>
                  {token.price ? `$${token.price >= 999999 ? `${(token.price / 1e6).toFixed(2)}M` : token.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: token.price < 1 ? 5 : 2 })}` : '—'}
                </span>
                <span className="text-xs font-sans" style={{ color: 'var(--widget-foreground)', opacity: 0.5 }}>
                  {token.address?.slice(0, 6)}...{token.address?.slice(-4)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AssetSelectionMenu;
