'use client';

import { TokenImage, TruncateString, formatNumber, getVenueIcon, getVenueLabel, type Asset } from '../../internal';
import React, { useState } from 'react';

interface WidgetWalletTradeItemProps {
  order: any;
  baseToken?: Asset | null;
  quoteToken?: Asset | null;
}

// Simple static inline SVGs — all use currentColor so they respond to the host app's theme vars
const IconCheck = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" />
    <path d="M3 5.2L4.3 6.5L7 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconX = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" />
    <path d="M3.5 3.5L6.5 6.5M6.5 3.5L3.5 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const IconClock = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" />
    <path d="M5 3V5.5L6.5 6.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
  </svg>
);

const IconDot = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="5" cy="5" r="1.5" fill="currentColor" />
  </svg>
);

const getEventTypeIcon = (eventType: string) => {
  switch ((eventType || '').toLowerCase()) {
    case 'completed':
    case 'settled':
    case 'success':
    case 'swapped':
    case 'swap':
      return { icon: <IconCheck />, color: 'var(--widget-primary)' };
    case 'received':
      return { icon: <IconDot />, color: 'var(--widget-accent)' };
    case 'failed':
    case 'error':
    case 'expired':
      return { icon: <IconX />, color: 'var(--widget-destructive)' };
    case 'pending':
    case 'created':
    case 'placed':
      return { icon: <IconClock />, color: 'var(--widget-muted-foreground)' };
    default:
      return { icon: <IconDot />, color: 'var(--widget-muted-foreground)' };
  }
};

const getEventTypeHoverBg = (eventType: string): string => {
  switch ((eventType || '').toLowerCase()) {
    case 'completed':
    case 'settled':
    case 'success':
    case 'swapped':
    case 'swap':
      return 'color-mix(in srgb, var(--widget-primary) 5%, transparent)';
    case 'failed':
    case 'error':
    case 'expired':
      return 'color-mix(in srgb, var(--widget-destructive) 5%, transparent)';
    case 'pending':
    case 'created':
    case 'placed':
      return 'color-mix(in srgb, var(--widget-accent) 5%, transparent)';
    default:
      return 'var(--widget-secondary)';
  }
};

const formatAmountSafe = (rawAmount: string, tokenData: Asset | null): string => {
  try {
    const numAmount = parseFloat(rawAmount || '0');
    if (isNaN(numAmount) || numAmount === 0) return '0';
    const decimals = tokenData?.decimals ?? 18;
    return formatNumber(numAmount / 10 ** decimals);
  } catch {
    return '0';
  }
};

export const WidgetWalletTradeItem: React.FC<WidgetWalletTradeItemProps> = ({
  order,
  baseToken,
  quoteToken,
}) => {
  const [hovered, setHovered] = useState(false);

  const eventType = order?.status || order?.eventType || 'unknown';
  const { icon: eventIcon, color: eventColor } = getEventTypeIcon(eventType);

  const venue: string | undefined = order?.venue;
  const venueIcon = venue ? getVenueIcon(venue) : undefined;
  const venueLabel = venue ? getVenueLabel(venue) : '';

  const formatDateTime = (timestamp: string) => {
    if (!timestamp) return { date: '', time: '' };
    const d = new Date(typeof timestamp === 'number' ? timestamp : Number(timestamp) || timestamp);
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false }) + ' UTC',
    };
  };

  const dateTime = formatDateTime(order?.timestamp || order?.createdAt || '');

  const inputDisplay = baseToken
    ? { asset: baseToken, symbol: baseToken.symbol, amount: formatAmountSafe(order?.inputAmount, baseToken) }
    : { asset: null, symbol: (order?.inputToken || '').slice(0, 6) + '...', amount: formatAmountSafe(order?.inputAmount, null) };

  const outputDisplay = quoteToken
    ? { asset: quoteToken, symbol: quoteToken.symbol, amount: formatAmountSafe(order?.outputAmount, quoteToken) }
    : { asset: null, symbol: (order?.outputToken || '').slice(0, 6) + '...', amount: formatAmountSafe(order?.outputAmount, null) };

  return (
    <a
      href={order?.explorerUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col cursor-pointer transition-all duration-200 ease-in-out no-underline"
      style={{
        border: '1px var(--widget-border-style) var(--widget-border)',
        backgroundColor: hovered ? getEventTypeHoverBg(eventType) : 'transparent',
        marginBottom: '0.5rem',
        padding: '0.25rem',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Top row: status + hash */}
      <div className="flex flex-row items-center justify-between space-x-1">
        <div className="flex flex-row items-center space-x-1">
          <div className="-translate-y-px" style={{ color: eventColor }}>{eventIcon}</div>
          <p className="text-2xs font-sans uppercase" style={{ color: eventColor }}>
            {eventType}
          </p>
          {venue && (
            <span className="inline-flex items-center gap-1 pl-1" style={{ color: 'var(--widget-muted-foreground)' }}>
              {venueIcon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={venueIcon} alt={venueLabel} width={11} height={11} style={{ borderRadius: 3 }} />
              ) : null}
              <span className="text-2xs font-sans">{venueLabel}</span>
            </span>
          )}
        </div>
        <div className="flex flex-row items-center space-x-2">
          <span className="text-2xs font-sans" style={{ color: hovered ? 'var(--widget-foreground)' : 'var(--widget-muted-foreground)' }}>
            {'¬ '}{TruncateString(order?.quoteId || order?.orderHash || '')}
          </span>
          <svg
            className="w-2.5 -translate-y-px opacity-70 group-hover:rotate-[-45deg] group-hover:opacity-100 duration-200"
            style={{ color: 'var(--widget-foreground)' }}
            viewBox="0 0 684 684"
            fill="none"
          >
            <path
              d="M0.666687 384.667L519.92 384.667L281.627 622.96L342 683.333L683.333 342L342 0.666687L281.627 61.04L519.92 299.333L0.666687 299.333V384.667Z"
              fill="currentColor"
            />
          </svg>
        </div>
      </div>

      {/* Bottom row: token swap details */}
      <div
        className="flex flex-row items-center justify-between pr-2"
        style={{ backgroundColor: hovered ? 'transparent' : 'var(--widget-secondary)' }}
      >
        <div className="flex flex-col w-full h-full p-2">
          <div className="flex h-8 w-full items-center justify-between px-2">
            <div className="flex items-center space-x-1">
              <TokenImage asset={inputDisplay.asset} size="xs" className="h-3 w-3" />
              <div className="flex flex-col">
                <span className="text-sm h-4" style={{ color: 'var(--widget-muted-foreground)' }}>
                  {inputDisplay.amount}
                </span>
                <span className="text-xs" style={{ color: 'var(--widget-foreground)' }}>
                  {inputDisplay.symbol}
                </span>
              </div>
              <span className="px-1" style={{ color: 'var(--widget-muted-foreground)' }}>→</span>
              <TokenImage asset={outputDisplay.asset} size="xs" className="h-3 w-3" />
              <div className="flex flex-col">
                <span className="text-sm h-4" style={{ color: 'var(--widget-muted-foreground)' }}>
                  {outputDisplay.amount}
                </span>
                <span className="text-xs" style={{ color: 'var(--widget-foreground)' }}>
                  {outputDisplay.symbol}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end text-right shrink-0">
          <span className="text-2xs font-sans whitespace-nowrap" style={{ color: 'var(--widget-muted-foreground)' }}>
            {dateTime.date}
          </span>
          {dateTime.time && (
            <span className="text-2xs font-sans whitespace-nowrap" style={{ color: 'var(--widget-muted-foreground)', opacity: 0.6 }}>
              {dateTime.time}
            </span>
          )}
        </div>
      </div>
    </a>
  );
};
