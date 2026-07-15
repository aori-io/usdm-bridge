'use client';

import React, { useEffect, useRef, useState } from 'react';
import { LoadingSpinner, getVenueIcon, getVenueLabel } from '../../internal';
import { useWidgetConfig } from '../../context/WidgetConfigContext';
import { useQuotes } from '../../providers/QuotesProvider';
import { useSwapFormContext } from '../../providers/SwapFormProvider';
import { QuoteRow, formatQuoteEta, formatQuoteOutput } from './QuoteRow';

const Chevron: React.FC<{ open: boolean }> = ({ open }) => (
  <span
    className="text-xs ml-2 transition-transform duration-200 shrink-0"
    style={{
      color: 'var(--widget-muted-foreground)',
      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
      display: 'inline-block',
    }}
  >
    ▾
  </span>
);

const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex justify-between items-center text-2xs" style={{ color: 'var(--widget-muted-foreground)' }}>
    <span>{label}</span>
    <span style={{ color: 'var(--widget-secondary-foreground)' }}>{children}</span>
  </div>
);

/**
 * Aggregator quote panel. A collapsed summary row shows the selected quote's
 * source (venue) + destination output; expanding reveals the full quote details
 * plus every venue's quote as a selectable row. Auto-opens for the `expanded`
 * quote-loader variant so users immediately see they can pick a route.
 */
export const QuoteList: React.FC = () => {
  const { quotes, selectedQuoteId, selectedQuote, bestQuoteId, setSelectedQuote, status, noQuotes, awaitingQuotes } =
    useQuotes();
  const { quoteToken } = useSwapFormContext();
  const { quoteLoaderVariant } = useWidgetConfig();

  const [expanded, setExpanded] = useState(quoteLoaderVariant === 'expanded');
  // Auto-open once quotes arrive for the expanded variant; only force once.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (quoteLoaderVariant === 'expanded' && quotes.length > 0 && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setExpanded(true);
    }
    if (quotes.length === 0) autoOpenedRef.current = false;
  }, [quoteLoaderVariant, quotes.length]);

  const isPolling = status === 'polling' || status === 'refreshing';
  const hasAnyActivity = isPolling || quotes.length > 0;
  if (!hasAnyActivity) return null;

  const headerQuote = selectedQuote ?? quotes[0] ?? null;
  // Single loader that renders from the initial request through until every
  // venue has responded — same element in both cases so the spinner never
  // remounts as the first quote lands and later ones stream in.
  const showLoader = awaitingQuotes || (isPolling && !headerQuote);

  // ── Collapsed summary header (clickable) ─────────────────────────────────
  const headerVenueIcon = headerQuote ? getVenueIcon(headerQuote.venue) : undefined;
  const headerVenueLabel = headerQuote ? getVenueLabel(headerQuote.venue) : '';
  const headerOutput = headerQuote ? formatQuoteOutput(headerQuote, quoteToken?.decimals ?? undefined) : '';
  const canToggle = quotes.length > 0;

  return (
    <div className="flex flex-col w-full py-2">
      <div
        className={`relative box-border flex h-8 w-full items-center ${canToggle ? 'cursor-pointer' : ''}`}
        role={canToggle ? 'button' : undefined}
        tabIndex={canToggle ? 0 : undefined}
        onClick={() => canToggle && setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (canToggle && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
      >
        {showLoader ? (
          <div className="flex w-full flex-row items-center justify-between">
            <div className="flex flex-row items-center gap-1.5 min-w-0">
              <LoadingSpinner size="4" color="var(--widget-foreground)" />
              <span className="text-xs" style={{ color: 'var(--widget-muted-foreground)' }}>
                Fetching quotes…
              </span>
            </div>
            {headerQuote ? (
              <div className="flex flex-row items-center">
                <span className="text-xs uppercase" style={{ color: 'var(--widget-muted-foreground)' }}>
                  {headerOutput} {quoteToken?.symbol ?? ''}
                </span>
              </div>
            ) : null}
          </div>
        ) : headerQuote ? (
          <div className="flex w-full flex-row items-center justify-between">
            <div className="flex flex-row items-center gap-1.5 min-w-0">
              {headerVenueIcon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={headerVenueIcon} alt={headerVenueLabel} width={16} height={16} style={{ borderRadius: 5 }} />
              ) : null}
              <span className="text-xs" style={{ color: 'var(--widget-muted-foreground)' }}>
                via {headerVenueLabel}
              </span>
              {headerQuote.quoteId === bestQuoteId ? (
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
            <div className="flex flex-row items-center">
              <span className="text-xs uppercase" style={{ color: 'var(--widget-muted-foreground)' }}>
                {headerOutput} {quoteToken?.symbol ?? ''}
              </span>
              {canToggle ? <Chevron open={expanded} /> : null}
            </div>
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--widget-muted-foreground)' }}>
            No routes available
          </p>
        )}
      </div>

      {/* ── Expanded: selectable venue quotes + details ── */}
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: expanded ? '460px' : '0px', opacity: expanded ? 1 : 0 }}
      >
        <div className="flex flex-col gap-1.5 pt-2 pb-1">
          <span className="text-2xs uppercase tracking-wider font-medium pb-0.5" style={{ color: 'var(--widget-muted-foreground)' }}>
            {quotes.length > 1 ? 'Select a route' : 'Route'}
          </span>

          {quotes.map((quote) => (
            <QuoteRow
              key={quote.venue}
              quote={quote}
              outputToken={quoteToken ?? null}
              selected={quote.quoteId === selectedQuoteId}
              isBest={quote.quoteId === bestQuoteId}
              onSelect={setSelectedQuote}
            />
          ))}

          {/* Details for the selected quote */}
          {selectedQuote ? (
            <div
              className="flex flex-col gap-1 mt-1 pt-2"
              style={{ borderTop: '1px solid var(--widget-border)' }}
            >
              {selectedQuote.outputAmountUsd ? (
                <DetailRow label="USD Value">${Number(selectedQuote.outputAmountUsd).toFixed(2)}</DetailRow>
              ) : null}
              {formatQuoteEta(selectedQuote.estimatedTimeSec) ? (
                <DetailRow label="Estimated Time">~{formatQuoteEta(selectedQuote.estimatedTimeSec)}</DetailRow>
              ) : null}
              {selectedQuote.priceImpactPercent ? (
                <DetailRow label="Price Impact">{Number(selectedQuote.priceImpactPercent).toFixed(2)}%</DetailRow>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {noQuotes && quotes.length === 0 && !isPolling ? (
        <div className="text-xs py-1 text-center" style={{ color: 'var(--widget-muted-foreground)' }}>
          No routes available
        </div>
      ) : null}
    </div>
  );
};

export default QuoteList;
