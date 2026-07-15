'use client';

import type { Asset } from '../types';
import { getTokenIcon, MISSING_TOKEN_SVG } from '../assets/tokenIcons';
import { getSymbolOverride } from '../assets/symbolOverrides';
import React, { useState } from 'react';
import ChainIcon from './ChainIcon';

const TokenImage = React.memo<{
  asset: Asset | null;
  size: '4xs' | '3xs' | 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  className?: string;
  noChain?: boolean;
}>(
  ({ asset, size, className, noChain }) => {
    // Track the specific URL that errored (not a generic boolean) so that when
    // the asset prop changes (token switch/invert), the new token's logoURI is
    // tried fresh even if the previous one failed.
    const [errorSrc, setErrorSrc] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fallbackImage = MISSING_TOKEN_SVG;

    const symbolOverride = asset?.symbol ? getSymbolOverride(asset.symbol) : undefined;
    const bundledIcon = asset?.symbol ? getTokenIcon(asset.symbol) : undefined;

    const getImageSrc = (): string => {
      const logoURI = asset?.logoURI;
      if (logoURI && logoURI !== errorSrc) return logoURI;
      if (symbolOverride) return symbolOverride;
      if (bundledIcon) return bundledIcon;
      return fallbackImage;
    };

    const imgSrc = getImageSrc();
    const hasSrc = imgSrc !== fallbackImage;
    const showSkeleton = hasSrc && isLoading && imgSrc !== errorSrc;

    const sizeMap = {
      '4xs': 'h-3 w-5',
      '3xs': 'h-4 w-4',
      xxs: 'h-5 w-5',
      xs: 'h-6 w-6',
      sm: 'h-8 w-8',
      md: 'h-10 w-10',
      lg: 'h-12 w-12',
      xl: 'h-14 w-14',
      xxl: 'h-16 w-16',
    };

    const sizeClasses = sizeMap[size];

    const chainConfig = {
      '4xs': { size: 'xs' as const, positioning: 'h-0 w-0', chainSize: 'xs' as const, style: {} as React.CSSProperties },
      '3xs': { size: 'xs' as const, positioning: 'h-0 w-0', chainSize: 'xs' as const, style: {} as React.CSSProperties },
      xxs: { size: 'xs' as const, positioning: 'absolute h-1 w-1', chainSize: 'xs' as const, style: { bottom: '-4px', left: '-6px' } as React.CSSProperties },
      xs: { size: 'xs' as const, positioning: 'absolute h-4 w-4', chainSize: 'xs' as const, style: { bottom: '-4px', left: '-6px' } as React.CSSProperties },
      sm: { size: 'sm' as const, positioning: 'absolute h-5 w-5', chainSize: 'xs' as const, style: { bottom: '-6px', left: '-3px' } as React.CSSProperties },
      md: { size: 'sm' as const, positioning: 'absolute h-6 w-6', chainSize: 'sm' as const, style: { bottom: '-6px', left: '-6px' } as React.CSSProperties },
      lg: { size: 'md' as const, positioning: 'absolute h-8 w-8', chainSize: 'sm' as const, style: { bottom: '-12px', left: '-4px' } as React.CSSProperties },
      xl: { size: 'md' as const, positioning: 'absolute h-9 w-9', chainSize: 'md' as const, style: { bottom: '-12px', left: '-8px' } as React.CSSProperties },
      xxl: { size: 'lg' as const, positioning: 'absolute h-10 w-10', chainSize: 'md' as const, style: { bottom: '-12px', left: '-6px' } as React.CSSProperties },
    };

    const chainSettings = chainConfig[size];

    return (
      <div className={`relative flex items-center justify-center bg-400 rounded-full aspect-square ${className} ${sizeClasses}`}>
        {showSkeleton && (
          <div className="absolute h-full w-full animate-pulse rounded-full bg-gray-700" />
        )}
        <img
          src={imgSrc}
          alt={`${asset?.symbol || 'token'} icon`}
          className={`h-full w-full rounded-full object-cover ${showSkeleton ? 'invisible' : ''}`}
          onError={() => { setErrorSrc(imgSrc); setIsLoading(false); }}
          onLoad={() => setIsLoading(false)}
        />
        {!noChain && asset && chainSettings.positioning !== 'h-0 w-0' && (
          <div className={chainSettings.positioning} style={chainSettings.style}>
            <ChainIcon chain={asset.chainId} size={chainSettings.chainSize} />
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.asset?.address === nextProps.asset?.address &&
      prevProps.asset?.chainId === nextProps.asset?.chainId &&
      prevProps.size === nextProps.size &&
      prevProps.noChain === nextProps.noChain &&
      prevProps.className === nextProps.className
    );
  },
);

TokenImage.displayName = 'TokenImage';

export default TokenImage;
