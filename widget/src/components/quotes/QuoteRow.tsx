'use client';

import type { NormalizedQuote } from 'usdm-bridge-sdk';
import React, { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { type Asset, getVenueIcon, getVenueLabel, toBigInt } from '../../internal';

export function formatQuoteOutput(quote: NormalizedQuote, decimals: number | undefined): string {
  if (decimals == null) return quote.outputAmount;
  try {
    const value = Number(formatUnits(toBigInt(quote.outputAmount), decimals));
    if (!Number.isFinite(value)) return quote.outputAmount;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
    return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  } catch {
    return quote.outputAmount;
  }
}

export function formatQuoteEta(sec: number | undefined): string | null {
  if (sec == null || !Number.isFinite(sec)) return null;
  if (sec < 60) return `${Math.round(sec)}s`;
  return `${Math.round(sec / 60)}m`;
}

interface QuoteRowProps {
  quote: NormalizedQuote;
  outputToken: Asset | null;
  selected: boolean;
  isBest: boolean;
  onSelect: (quoteId: string) => void;
}

export const QuoteRow: React.FC<QuoteRowProps> = ({ quote, outputToken, selected, isBest, onSelect }) => {
  const venueIcon = getVenueIcon(quote.venue);
  const venueLabel = getVenueLabel(quote.venue);
  const eta = formatQuoteEta(quote.estimatedTimeSec);
  const output = formatQuoteOutput(quote, outputToken?.decimals ?? undefined);

  // Fade in when the row first appears (a venue's first quote). Rows are keyed by
  // venue, so this only runs once per venue — refetches update in place, no flash.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <button
      type="button"
      onClick={() => onSelect(quote.quoteId)}
      aria-pressed={selected}
      className="flex w-full flex-row items-center justify-between gap-2 px-3 py-2 text-left cursor-pointer"
      style={{
        borderRadius: 'var(--widget-radius)',
        border: `1px solid ${selected ? 'var(--widget-primary)' : 'var(--widget-border)'}`,
        backgroundColor: selected ? 'color-mix(in srgb, var(--widget-primary) 8%, transparent)' : 'transparent',
        opacity: mounted ? 1 : 0,
        transition: 'opacity 0.2s ease-out, border-color 0.15s ease, background-color 0.15s ease',
      }}
    >
      <div className="flex flex-row items-center gap-2 min-w-0">
        {venueIcon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={venueIcon} alt={venueLabel} width={20} height={20} style={{ borderRadius: 6, flexShrink: 0 }} />
        ) : null}
        <div className="flex flex-col min-w-0">
          <div className="flex flex-row items-center gap-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--widget-foreground)' }}>
              {venueLabel}
            </span>
            {isBest ? (
              <span
                className="inline-flex items-center justify-center font-medium uppercase"
                style={{
                  fontSize: '0.55rem',
                  lineHeight: 1,
                  letterSpacing: '0.04em',
                  // Top-heavy padding compensates for the font's tall cap metrics
                  // so the text sits optically centered in the pill.
                  padding: '3px 6px 2px',
                  borderRadius: 'var(--widget-radius)',
                  backgroundColor: 'var(--widget-primary)',
                  color: 'var(--widget-primary-foreground)',
                }}
              >
                Best
              </span>
            ) : null}
          </div>
          {(eta || quote.priceImpactPercent) && (
            <span className="text-2xs" style={{ color: 'var(--widget-muted-foreground)' }}>
              {eta ? `~${eta}` : ''}
              {eta && quote.priceImpactPercent ? ' · ' : ''}
              {quote.priceImpactPercent ? `${Number(quote.priceImpactPercent).toFixed(2)}% impact` : ''}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end shrink-0">
        <span className="text-xs font-medium" style={{ color: 'var(--widget-foreground)' }}>
          {output} {outputToken?.symbol ?? ''}
        </span>
        {quote.outputAmountUsd ? (
          <span className="text-2xs" style={{ color: 'var(--widget-muted-foreground)' }}>
            ${Number(quote.outputAmountUsd).toFixed(2)}
          </span>
        ) : null}
      </div>
    </button>
  );
};
