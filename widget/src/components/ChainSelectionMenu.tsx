'use client';

import { ChainIcon, type SupportedChainId, useDebounce, getAvailableChainConfigs } from '../internal';
import { useEnabledChainIds } from '../hooks/useEnabledChainIds';
import { useEffectiveTokenConfig } from '../hooks/useEffectiveTokenConfig';
import React, { useCallback, useMemo, useState } from 'react';

interface ChainSelectionMenuProps {
  toggle: () => void;
  side: 'base' | 'quote';
  onChainSelect: (chainId: SupportedChainId) => void;
  onChainHover?: (chainName: string | null) => void;
  containerHeight?: string;
}

const ChainSelectionMenu: React.FC<ChainSelectionMenuProps> = ({
  toggle,
  side,
  onChainSelect,
  onChainHover,
  containerHeight,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const availableChainIds = useEnabledChainIds();
  const allChains = getAvailableChainConfigs(availableChainIds);
  const { effectivePrioritizedInputChains } = useEffectiveTokenConfig();
  const sidePrioritizedChains = side === 'base' ? effectivePrioritizedInputChains : [];

  const sortedChains = useMemo(() => {
    if (sidePrioritizedChains.length === 0) return allChains;
    const prioritySet = new Set(sidePrioritizedChains);
    const priorityIndexMap = new Map(sidePrioritizedChains.map((id, i) => [id, i]));
    const prioritized = allChains
      .filter((c) => prioritySet.has(c.id))
      .sort((a, b) => (priorityIndexMap.get(a.id) ?? 0) - (priorityIndexMap.get(b.id) ?? 0));
    const rest = allChains.filter((c) => !prioritySet.has(c.id));
    return [...prioritized, ...rest];
  }, [allChains, sidePrioritizedChains]);

  const filteredChains = React.useMemo(() => {
    if (!debouncedSearchQuery) return sortedChains;
    const query = debouncedSearchQuery.toLowerCase();
    return sortedChains.filter(
      (chain) =>
        chain.displayName.toLowerCase().includes(query) ||
        chain.name.toLowerCase().includes(query) ||
        chain.id.toString().includes(query),
    );
  }, [sortedChains, debouncedSearchQuery]);

  const handleChainSelection = useCallback(
    (chainId: SupportedChainId) => onChainSelect(chainId),
    [onChainSelect],
  );

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-shrink-0">
        <div className="relative mt-3">
          <input
            className="w-full h-10 px-4 text-sm"
            style={{ backgroundColor: 'var(--widget-card)', color: 'var(--widget-card-foreground)', border: '1px solid var(--widget-border)' }}
            placeholder="Search chains by name or chain ID..."
            autoComplete="off"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value.toLowerCase())}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
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

      <div
        className="flex-1 min-h-0 overflow-auto mt-2 pb-4"
        style={{ backgroundColor: 'var(--widget-background)' }}
      >
        <p className="my-2 ml-4 text-xs" style={{ color: 'var(--widget-muted-foreground)' }}>
          {searchQuery ? 'Search Results' : 'Available Chains'}
        </p>

        {filteredChains.length === 0 ? (
          <div className="px-4 py-3 text-sm" style={{ color: 'var(--widget-muted-foreground)' }}>
            Chain Not Found
          </div>
        ) : (
          filteredChains.map((chain) => (
            <button
              key={chain.id}
              type="button"
              className="w-full flex items-center justify-between p-3 cursor-pointer transition-colors"
              style={{ borderBottom: '1px solid var(--widget-border)' }}
              onClick={() => handleChainSelection(chain.id as SupportedChainId)}
              onMouseEnter={() => onChainHover?.(chain.displayName)}
              onMouseLeave={() => onChainHover?.(null)}
            >
              <div className="flex items-center space-x-3 min-w-0 flex-1">
                <div className="flex-shrink-0">
                  <ChainIcon chain={chain.id} size="md" />
                </div>
                <span className="text-base font-medium truncate" style={{ color: 'var(--widget-foreground)' }}>
                  {chain.displayName}
                </span>
              </div>
              <span className="text-xs font-sans" style={{ color: 'var(--widget-muted-foreground)' }}>
                Chain ID: {chain.id}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default ChainSelectionMenu;
