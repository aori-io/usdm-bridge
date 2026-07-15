'use client';

import type { ToastStatus } from '../../stores/swapUIStore';
import {
  Checkmark,
  LoadingSpinner,
  RedoAnimation,
  XAnimation,
  isReviewStepPast,
  type Asset,
  type ReviewOrderStep,
} from '../../internal';
import React, { useEffect } from 'react';
import { useWidgetSwapUIStore } from '../../stores/swapUIStore';

const ExternalLinkIcon = () => (
  <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 13V19C18 20.1046 17.1046 21 16 21H5C3.89543 21 3 20.1046 3 19V8C3 6.89543 3.89543 6 5 6H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 3H21V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ComponentStep: ReviewOrderStep = 'trackingTx';

interface IReviewActionTxRow {
  orderHash: string;
  base: Asset;
  quote: Asset;
  baseAmount: number;
  quoteAmount: number;
  reviewState: ReviewOrderStep | null;
  onNewSwap: () => void;
  onRetry: () => void;
  status: ToastStatus;
}

const statusConfig = {
  pending: {
    icon: <LoadingSpinner size="5" />,
    buttonText: 'Trade Pending',
    statusVar: 'var(--widget-primary)',
    clickable: false,
    showViewTx: false,
    showContinue: false,
  },
  received: {
    icon: <LoadingSpinner size="5" />,
    buttonText: 'Trade Received',
    statusVar: 'var(--widget-primary)',
    clickable: false,
    showViewTx: false,
    showContinue: false,
  },
  completed: {
    icon: <Checkmark className="h-5 w-5" />,
    buttonText: 'View Tx',
    statusVar: 'var(--widget-status-completed)',
    clickable: true,
    showViewTx: true,
    showContinue: true,
  },
  failed: {
    icon: <XAnimation />,
    buttonText: 'View Tx',
    statusVar: 'var(--widget-status-failed)',
    clickable: true,
    showViewTx: true,
    showContinue: true,
  },
  cancelled: {
    icon: <XAnimation />,
    buttonText: 'View Tx',
    statusVar: 'var(--widget-status-failed)',
    clickable: true,
    showViewTx: true,
    showContinue: true,
  },
  expired: {
    icon: <XAnimation />,
    buttonText: 'Order Expired',
    statusVar: 'var(--widget-status-failed)',
    clickable: true,
    showViewTx: false,
    showContinue: false,
  },
} as const;

const ReviewActionTxRow: React.FC<IReviewActionTxRow> = ({
  orderHash, base, quote, baseAmount, quoteAmount, reviewState, onNewSwap, onRetry, status,
}) => {
  const hasSucceeded = isReviewStepPast(ComponentStep, reviewState);
  const config = statusConfig[status] || statusConfig.pending;
  const explorerUrl = useWidgetSwapUIStore((state) => state.explorerUrl);

  useEffect(() => {
    if (status === 'completed') {
      const timer = setTimeout(onNewSwap, 5000);
      return () => clearTimeout(timer);
    }
    if (status === 'failed' || status === 'expired') {
      const timer = setTimeout(onNewSwap, 5000);
      return () => clearTimeout(timer);
    }
  }, [status, onNewSwap]);

  const sv = config.statusVar;
  const showDualButtons = config.showViewTx && config.showContinue;
  const showViewTxButton = showDualButtons && (status !== 'failed' || !!explorerUrl);

  const btnBase = 'inline-flex h-12 items-center justify-center text-sm font-sans font-medium transition duration-150 cursor-pointer';

  if (showDualButtons) {
    return (
      <div className="flex flex-row gap-2 w-full px-4 min-w-0">
        {showViewTxButton && (
          <button
            type="button"
            className={`${btnBase} flex-1 min-w-0`}
            style={{
              backgroundColor: `color-mix(in srgb, ${sv} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${sv} 20%, transparent)`,
              color: sv,
              borderRadius: 'var(--widget-radius)',
            }}
            onClick={() => explorerUrl && window.open(explorerUrl, '_blank', 'noopener,noreferrer')}
          >
            <div className="flex h-10 w-full flex-row items-center justify-between px-3">
              <div className="flex flex-row items-center gap-2 min-w-0">
                <div className="flex h-5 w-5 items-center justify-center rounded-full overflow-hidden shrink-0">
                  {config.icon}
                </div>
                <p className="whitespace-nowrap text-xs">{config.buttonText}</p>
              </div>
              <div className="flex h-5 w-5 items-center justify-center shrink-0">
                <ExternalLinkIcon />
              </div>
            </div>
          </button>
        )}
        <button
          type="button"
          className={`${btnBase} ${showViewTxButton ? 'flex-1' : 'w-full'} min-w-0`}
          style={{
            backgroundColor: `color-mix(in srgb, ${sv} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${sv} 20%, transparent)`,
            color: sv,
            borderRadius: 'var(--widget-radius)',
          }}
          onClick={onNewSwap}
        >
          <div className="flex h-10 w-full flex-row items-center justify-between px-3">
            <p className="whitespace-nowrap text-xs">Continue Swapping</p>
            <div className="flex h-5 w-5 items-center justify-center shrink-0">
              <RedoAnimation />
            </div>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-row justify-between space-x-3 w-full px-4">
      <button
        type="button"
        className={`${btnBase} w-full ${config.clickable ? '' : 'cursor-not-allowed!'}`}
        style={{
          backgroundColor: `color-mix(in srgb, ${sv} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${sv} 20%, transparent)`,
          color: sv,
          borderRadius: 'var(--widget-radius)',
        }}
        onClick={config.clickable ? onNewSwap : undefined}
      >
        <div className="flex h-10 w-full flex-row items-center space-x-3 px-4">
          <div className="flex h-6 w-6 items-center justify-center rounded-full overflow-hidden shrink-0">
            {config.icon}
          </div>
          <p className="whitespace-nowrap">{config.buttonText}</p>
          <div className="flex flex-1 border-t" style={{ borderColor: 'var(--widget-border)' }} />
          {config.clickable && (
            <div className="flex h-6 w-6 items-center justify-center">
              {status === 'expired' ? <RedoAnimation /> : <ExternalLinkIcon />}
            </div>
          )}
        </div>
      </button>
    </div>
  );
};

export default ReviewActionTxRow;
