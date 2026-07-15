import { getChainConfig, getChainIdByKey } from '../chainsConfig';
import { getChainIcon } from '../assets/chainIcons';
import React from 'react';

interface ChainIconProps {
  chain: string | number;
  size?: 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  alt?: string;
  title?: string;
}

const SIZE_PRESETS = {
  xxs: 12,
  xs: 16,
  sm: 22,
  md: 28,
  lg: 40,
  xl: 48,
};

const ChainIcon = React.memo<ChainIconProps>(
  ({ chain, size = 'md', className = '', alt, title }) => {
    const { chainKey, logoUrl } = React.useMemo(() => {
      const fallback = getChainIcon('ethereum')!;
      if (chain === null || chain === undefined || (typeof chain === 'number' && isNaN(chain))) {
        return { chainKey: 'ethereum', logoUrl: fallback };
      }
      if (typeof chain === 'number') {
        const config = getChainConfig(chain);
        return { chainKey: config?.key || 'ethereum', logoUrl: config?.logoUrl || fallback };
      }
      const chainId = getChainIdByKey(chain);
      if (chainId) {
        const config = getChainConfig(chainId);
        return { chainKey: chain.toLowerCase(), logoUrl: config?.logoUrl || fallback };
      }
      return { chainKey: 'ethereum', logoUrl: fallback };
    }, [chain]);

    const pixelSize = typeof size === 'number' ? size : SIZE_PRESETS[size];
    const altText = alt || `${chainKey} chain icon`;
    const titleText = title || chainKey;

    return (
      <img
        src={logoUrl}
        width={pixelSize}
        height={pixelSize}
        alt={altText}
        className={`${className}`}
        title={titleText}
        aria-label={altText}
      />
    );
  },
  (prevProps, nextProps) => {
    return prevProps.chain === nextProps.chain && prevProps.size === nextProps.size && prevProps.className === nextProps.className;
  },
);

ChainIcon.displayName = 'ChainIcon';

export default ChainIcon;
