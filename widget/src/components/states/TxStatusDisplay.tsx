'use client';

import {
  Checkmark,
  ChainIcon,
  LoadingSpinner,
  TokenImage,
  XAnimation,
  formatNumber,
  getChainConfig,
  getVenueIcon,
  getVenueLabel,
  type Asset,
} from '../../internal';
import { parseExplorerHash } from '../../lib/parseExplorerHash';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { ToastStatus } from '../../stores/swapUIStore';
import { useWidgetSwapUIStore } from '../../stores/swapUIStore';

interface TxStatusDisplayProps {
  orderHash: string;
  base: Asset;
  quote: Asset;
  baseAmount: number;
  quoteAmount: number;
  status: ToastStatus | string;
  /** Venue that executed the swap (aggregator mode). Defaults to Aori. */
  venue?: string;
}

const statusVarMap: Record<string, string> = {
  pending: 'var(--widget-status-pending)',
  received: 'var(--widget-status-received)',
  completed: 'var(--widget-status-completed)',
  failed: 'var(--widget-status-failed)',
  cancelled: 'var(--widget-status-failed)',
  expired: 'var(--widget-status-failed)',
};

const StatusIcon = ({ status }: { status: string }) => {
  const color = statusVarMap[status] ?? statusVarMap.pending;

  switch (status) {
    case 'completed':
      return <Checkmark className="h-6 w-6" />;
    case 'failed':
    case 'cancelled':
    case 'expired':
      return <XAnimation className="h-6 w-6" />;
    default:
      return <LoadingSpinner size="5" color={color} />;
  }
};

function formatRate(rate: number): string {
  if (rate === 0) return '0';
  const abs = Math.abs(rate);
  if (abs >= 1_000_000_000) return `${(rate / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(rate / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(rate / 1_000).toFixed(2)}K`;
  if (abs >= 1_000) return rate.toFixed(1);
  if (abs >= 100) return rate.toFixed(2);
  if (abs >= 1) return rate.toFixed(4);
  return rate.toFixed(6);
}


function getAmountFontSize(text: string): number {
  const len = text.length;
  if (len <= 4) return 48;
  if (len <= 6) return 40;
  if (len <= 8) return 34;
  return 28;
}

const ExternalLinkIcon = () => (
  <svg
    className="w-3 h-3 shrink-0"
    style={{ color: 'var(--widget-secondary-foreground)' }}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M18 13V19C18 20.1046 17.1046 21 16 21H5C3.89543 21 3 20.1046 3 19V8C3 6.89543 3.89543 6 5 6H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 3H21V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const AoriIcon = () => (
  <svg className="w-3 h-3 shrink-0" viewBox="0 0 195 321" fill="var(--widget-secondary-foreground)" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      d="M195,189C195,207.02,195,225.04,194.7,243.21C193.68,244.78,192.9,246.17,192.25,247.63C189.71,253.38,187.74,259.46,184.6,264.86C169.44,290.97,147.86,309.46,118.54,318.86C116.44,319.55,114.72,320.27,113,321C97.65,321,82.29,321,66.36,320.66C64.21,319.86,62.64,319.4,60.77,318.73C34.51,310.12,15.56,293.82,4.22,268.85C3.68,267.66,2.1,266.94,1,266C1,242.31,1,218.62,1.29,194.79C2.84,192.16,4.11,189.7,5.34,187.22C18.42,160.94,39.89,144.07,66.64,133.63C76.92,129.62,87.87,127.33,98.67,124.2C97.79,123.24,96.8,121.93,95.59,120.86C85.84,112.3,75.95,103.89,66.3,95.21C55.93,85.86,45.02,76.96,35.71,66.63C21.14,50.5,20.04,23.08,45.41,9.57C50.08,7.08,55.12,5.26,59.93,3.03C60.76,2.64,61.32,1.69,62,1C86.69,1,111.38,1,136.23,1.32C138.04,2.32,139.67,3.01,141.32,3.67C147.64,6.19,154.12,8.39,160.26,11.32C166.83,14.45,172.19,19.18,175.44,25.95C179.39,34.19,178.09,43.36,172.05,49.56C165.75,56.03,157.21,57.8,148.78,52.89C142.4,49.17,136.86,43.96,131.1,39.23C122.63,32.28,115.05,23.88,105.74,18.38C87.78,7.76,68.84,9.07,51.16,19.53C38.68,26.91,36.37,41.4,45.53,52.71C50.38,58.69,56.45,64,62.83,68.36C87.15,84.99,111.86,101.05,136.34,117.44C162.56,135,183.88,156.57,193.26,187.79C193.42,188.32,194.4,188.6,195,189ZM77.06,146.49C61.39,155.71,51.27,169.26,45.93,186.5C39.48,207.32,39.44,228.5,42.93,249.76C45.84,267.48,53.16,282.95,66.59,295.39C83.82,311.34,108.85,312.86,127.37,298.41C138.98,289.35,146.05,277.03,149.48,263.04C161.53,213.92,148.4,171.97,112.16,137.05C111.13,136.06,108.71,135.6,107.31,136.05C97.38,139.22,87.54,142.7,77.06,146.49Z"
    />
    <path d="M118.83,199C121.61,197.69,122.77,198.41,122.77,201.27C122.71,217.43,122.78,233.58,122.65,249.73C122.65,250.83,121.43,251.92,120.77,253.01C119.97,252.05,118.63,251.17,118.45,250.1C116.32,237.7,113.36,235.12,100.61,235.02C98.12,235,95.62,234.98,93.12,235.01C81.26,235.16,77.72,238.3,75.94,249.84C75.74,251.15,74.39,252.28,73.57,253.49C73.11,253.23,72.64,252.98,72.17,252.73C72.17,234.81,72.17,216.88,72.17,198.96C72.49,198.62,72.81,198.28,73.13,197.93C74.09,198.95,75.72,199.85,75.92,201C78.13,213.8,80.95,216.26,94.05,216.3C97.38,216.31,100.72,216.44,104.04,216.27C113.28,215.79,117.15,212.05,118.22,202.81C118.35,201.65,118.47,200.49,118.83,199Z" />
  </svg>
);

const TxStatusDisplay: React.FC<TxStatusDisplayProps> = ({
  orderHash,
  base,
  quote,
  baseAmount,
  quoteAmount,
  status,
  venue,
}) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const receivedTimeRef = useRef<number | null>(null);
  const submissionTimeRef = useRef<number>(Date.now());
  const [transactionSpeed, setTransactionSpeed] = useState<number | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { isRecipientInputOpen, recipient, explorerUrl } = useWidgetSwapUIStore(
    useShallow((state) => ({
      isRecipientInputOpen: state.isRecipientInputOpen,
      recipient: state.recipient,
      explorerUrl: state.explorerUrl,
    })),
  );

  useEffect(() => {
    if (status === 'received') receivedTimeRef.current = Date.now();
  }, [status]);

  useEffect(() => {
    if (status === 'completed' && !transactionSpeed) {
      const startTime = receivedTimeRef.current || submissionTimeRef.current;
      setTransactionSpeed((Date.now() - startTime) / 1000);
    }
  }, [status, transactionSpeed]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopyHash = useCallback(() => {
    if (!navigator.clipboard?.writeText) return;
    const textToCopy = explorerUrl
      ? parseExplorerHash(explorerUrl) ?? orderHash
      : orderHash;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [orderHash, explorerUrl]);

  const formattedBaseAmount = formatNumber(baseAmount);
  const formattedQuoteAmount = formatNumber(quoteAmount);
  const isTerminal = status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'expired';
  const isPendingLike = !isTerminal;

  const exchangeRate = baseAmount && quoteAmount ? baseAmount / quoteAmount : 0;
  const shouldFlipRate = exchangeRate > 0 && exchangeRate < 1;
  const displayRate = shouldFlipRate ? 1 / exchangeRate : exchangeRate;
  const rateFromToken = shouldFlipRate ? base : quote;
  const rateToToken = shouldFlipRate ? quote : base;
  const rateUsdLabel = base?.price
    ? `≈ $${(shouldFlipRate ? base.price : base.price * exchangeRate).toFixed(2)}`
    : '';

  const baseChainConfig = getChainConfig(base.chainId);
  const quoteChainConfig = getChainConfig(quote.chainId);
  const baseChainName = baseChainConfig?.displayName ?? `Chain ${base.chainId}`;
  const quoteChainName = quoteChainConfig?.displayName ?? `Chain ${quote.chainId}`;

  const isCrossChain = base.chainId !== quote.chainId;
  const baseEstMs = baseChainConfig?.estimatedTimeMs ?? 0;
  const quoteEstMs = quoteChainConfig?.estimatedTimeMs ?? 0;
  const estimatedTimeSeconds = (isCrossChain ? baseEstMs + quoteEstMs : baseEstMs) / 1000;

  const displayHash = explorerUrl
    ? parseExplorerHash(explorerUrl) ?? orderHash
    : orderHash;
  const truncatedHash = `${displayHash.slice(0, 6)} … ${displayHash.slice(-4)}`;

  // Route / order-type reflect the executing venue (defaults to Aori for the
  // classic single-venue flow, which passes no `venue`).
  const routeVenueIcon = venue ? getVenueIcon(venue) : undefined;
  const routeLabel = venue ? getVenueLabel(venue) : 'Aori';
  const routeUrl = venue === 'relay' ? 'https://relay.link' : 'https://www.aori.io';
  const orderTypeLabel = !venue || venue === 'aori' ? 'RFQ (Limit)' : 'Bridge';

  return (
    <div className="relative w-full flex flex-col">
      {/* Swap card */}
      <div
        className="mx-4 mt-2"
        style={{ backgroundColor: 'var(--widget-secondary)' }}
      >
        {/* From token */}
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <TokenImage asset={base} size="md" noChain />
                <div>
                  <p
                    className="text-xl font-thin uppercase"
                    style={{ color: 'var(--widget-foreground)' }}
                  >
                    {base.symbol}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: 'var(--widget-muted-foreground)' }}
                  >
                    {base.name}
                  </p>
                </div>
              </div>
              <div
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--widget-muted-foreground) 20%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--widget-muted-foreground) 30%, transparent)',
                }}
              >
                <ChainIcon chain={base.chainId} size="xs" />
                <span
                  className="text-xs pt-0.5"
                  style={{ color: 'var(--widget-muted-foreground)' }}
                >
                  {baseChainName}
                </span>
              </div>
            </div>

            <div className="text-right">
              <p
                className="font-thin tracking-tight font-sans"
                style={{
                  color: 'var(--widget-foreground)',
                  fontSize: `${getAmountFontSize(formattedBaseAmount)}px`,
                  transition: 'font-size 0.1s ease-out',
                }}
              >
                {formattedBaseAmount}
              </p>
              {base.price && (
                <p
                  className="text-xs mt-1 font-sans"
                  style={{ color: 'var(--widget-muted-foreground)' }}
                >
                  ${(base.price * baseAmount).toFixed(2)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Divider with centered status indicator */}
        <div className="relative">
          <div style={{ borderTop: '1px solid var(--widget-border)' }} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: 'var(--widget-secondary)',
                border: '1px solid var(--widget-border)',
              }}
            >
              <StatusIcon status={status as string} />
            </div>
          </div>
        </div>

        {/* To token */}
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <TokenImage asset={quote} size="md" noChain />
                <div>
                  <p
                    className="text-xl font-thin uppercase"
                    style={{ color: 'var(--widget-foreground)' }}
                  >
                    {quote.symbol}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: 'var(--widget-muted-foreground)' }}
                  >
                    {quote.name}
                  </p>
                </div>
              </div>
              <div
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--widget-muted-foreground) 20%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--widget-muted-foreground) 30%, transparent)',
                }}
              >
                <ChainIcon chain={quote.chainId} size="xs" />
                <span
                  className="text-xs pt-0.5"
                  style={{ color: 'var(--widget-muted-foreground)' }}
                >
                  {quoteChainName}
                </span>
              </div>
            </div>

            <div className="text-right">
              <p
                className="font-thin tracking-tight font-sans"
                style={{
                  color: 'var(--widget-foreground)',
                  fontSize: `${getAmountFontSize(formattedQuoteAmount)}px`,
                  transition: 'font-size 0.1s ease-out',
                }}
              >
                {formattedQuoteAmount}
              </p>
              {quote.price && (
                <p
                  className="text-xs mt-1 font-sans"
                  style={{ color: 'var(--widget-muted-foreground)' }}
                >
                  ${(quote.price * quoteAmount).toFixed(2)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recipient */}
      {isRecipientInputOpen && recipient && (
        <div className="mx-4 mt-2 px-5 pb-2">
          <div
            className="flex items-center gap-2 p-2 rounded-full"
            style={{ backgroundColor: 'var(--widget-secondary)' }}
          >
            <div
              className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--widget-muted)' }}
            >
              <span className="text-2xs">👤</span>
            </div>
            <span
              className="text-xs"
              style={{ color: 'var(--widget-muted-foreground)' }}
            >
              To:
            </span>
            <span
              className="text-xs font-sans"
              style={{ color: 'var(--widget-foreground)' }}
            >
              {recipient.slice(0, 6)}...{recipient.slice(-4)}
            </span>
          </div>
        </div>
      )}

      {/* Order details — collapsible (matches QuoteLoader expanded variant) */}
      <div
        className="px-4 mt-4"
        style={{
          borderTop: '1px solid var(--widget-border)',
          borderBottom: '1px solid var(--widget-border)',
        }}
      >
        <div
          className="relative box-border flex flex-row h-8 w-full items-center cursor-pointer"
          role="button"
          tabIndex={0}
          onClick={() => setIsExpanded(!isExpanded)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsExpanded(!isExpanded); } }}
        >
          <div className="flex h-full items-center w-full overflow-hidden" style={{ color: 'var(--widget-muted-foreground)' }}>
            <div className="translate-y-px font-sans flex w-full flex-row items-center justify-between">
              <div className="flex flex-row items-center gap-2 whitespace-nowrap">
                <div className="flex flex-row items-center gap-1">
                  <TokenImage asset={rateFromToken} size="3xs" noChain className="mb-0.5" />
                  <span className="text-xs uppercase" style={{ color: 'var(--widget-muted-foreground)' }}>1 {rateFromToken.symbol}</span>
                </div>
                <span className="text-xs" style={{ color: 'var(--widget-muted-foreground)' }}>=</span>
                <div className="flex flex-row items-center gap-1">
                  <TokenImage asset={rateToToken} size="3xs" noChain className="mb-0.5" />
                  <span className="text-xs uppercase" style={{ color: 'var(--widget-muted-foreground)' }}>{formatRate(displayRate)} {rateToToken.symbol}</span>
                </div>
                <span className="text-xs" style={{ color: 'var(--widget-muted-foreground)' }}>
                  {rateUsdLabel}
                </span>
              </div>
              <span
                className="text-xs ml-2 transition-transform duration-200 shrink-0"
                style={{
                  color: 'var(--widget-muted-foreground)',
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  display: 'inline-block',
                }}
              >
                ▾
              </span>
            </div>
          </div>
        </div>

        <div
          className="overflow-hidden transition-all duration-200"
          style={{
            maxHeight: isExpanded ? '200px' : '0px',
            opacity: isExpanded ? 1 : 0,
          }}
        >
          <div className="flex flex-col gap-1 pb-1.5 font-sans">
            <div className="flex justify-between text-2xs" style={{ color: 'var(--widget-muted-foreground)' }}>
              <span>USD Value</span>
              <span style={{ color: 'var(--widget-secondary-foreground)' }}>${base.price ? (base.price * baseAmount).toFixed(2) : '—'}</span>
            </div>
            <div className="flex justify-between text-2xs" style={{ color: 'var(--widget-muted-foreground)' }}>
              <span style={{ color: 'var(--widget-muted-foreground)' }}>Order Type</span>
              <span style={{ color: 'var(--widget-secondary-foreground)' }}>{orderTypeLabel}</span>
            </div>
            <div className="flex justify-between items-center text-2xs" style={{ color: 'var(--widget-muted-foreground)' }}>
              <span>Transaction</span>
              {explorerUrl ? (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 transition-colors hover:opacity-80"
                  style={{ color: 'var(--widget-secondary-foreground)' }}
                >
                  <span>{copied ? 'Copied!' : truncatedHash}</span>
                  <ExternalLinkIcon />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={handleCopyHash}
                  className="flex items-center gap-1 cursor-pointer transition-colors"
                  style={{ color: 'var(--widget-secondary-foreground)' }}
                >
                  <span style={{ color: 'var(--widget-secondary-foreground)' }}>{copied ? 'Copied!' : truncatedHash}</span>
                  <ExternalLinkIcon />
                </button>
              )}
            </div>
            <div className="flex justify-between text-2xs" style={{ color: 'var(--widget-muted-foreground)' }}>
              <span>{isTerminal ? 'Speed' : 'Est. Time'}</span>
              <span style={{ color: 'var(--widget-secondary-foreground)' }}>
                {transactionSpeed
                  ? `${transactionSpeed.toFixed(2)}s`
                  : estimatedTimeSeconds > 0
                    ? `~${estimatedTimeSeconds}s`
                    : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center text-2xs" style={{ color: 'var(--widget-muted-foreground)' }}>
              <span>Route</span>
              <a
                href={routeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 transition-colors hover:opacity-80"
                style={{ color: 'var(--widget-secondary-foreground)' }}
              >
                {routeVenueIcon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={routeVenueIcon} alt={routeLabel} width={12} height={12} style={{ borderRadius: 4 }} />
                ) : (
                  <AoriIcon />
                )}
                {routeLabel}
                <ExternalLinkIcon />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TxStatusDisplay;
