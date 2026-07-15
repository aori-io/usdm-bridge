'use client';

import { ChainIcon, Checkmark, LoadingSpinner, RedoIcon, isReviewStepPast, type SupportedChainId, type ReviewOrderStep } from '../../internal';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';

type ChainState = 'pending' | 'error' | 'success';

const WALLET_TIMEOUT_MS = 15_000;

interface IReviewActionChainSwitchRow {
  needsChainSwitch: boolean;
  requiredChain: { chainId: SupportedChainId; name: string };
  reviewState: ReviewOrderStep | null;
  goToNextStep: (componentStep: ReviewOrderStep, currentStep: ReviewOrderStep | null) => void;
  cancel: () => Promise<void>;
}

const ComponentStep: ReviewOrderStep = 'chain';

const ReviewActionChainSwitchRow: React.FC<IReviewActionChainSwitchRow> = ({
  needsChainSwitch, requiredChain, reviewState, goToNextStep, cancel,
}) => {
  const hasSucceeded = isReviewStepPast(ComponentStep, reviewState);
  const [chainState, setChainState] = useState<ChainState>('pending');
  const isSwitching = useRef(false);
  const switchAttempted = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { status: wagmiStatus, isReconnecting } = useAccount();

  const clearPendingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleChainSwitch = useCallback(async () => {
    if (isSwitching.current || switchAttempted.current || wagmiStatus !== 'connected' || isReconnecting) return;
    isSwitching.current = true;
    switchAttempted.current = true;
    setChainState('pending');

    timeoutRef.current = setTimeout(() => {
      if (isSwitching.current) {
        setChainState('error');
        isSwitching.current = false;
      }
    }, WALLET_TIMEOUT_MS);

    try {
      await switchChainAsync({ chainId: requiredChain.chainId });
      clearPendingTimeout();
      setChainState('success');
      goToNextStep(ComponentStep, reviewState);
    } catch {
      clearPendingTimeout();
      setChainState('error');
    } finally {
      isSwitching.current = false;
    }
  }, [switchChainAsync, wagmiStatus, isReconnecting, requiredChain.chainId, goToNextStep, reviewState, clearPendingTimeout]);

  useEffect(() => {
    if (isSwitching.current || switchAttempted.current) return;
    if (reviewState === ComponentStep && chainState === 'pending' && wagmiStatus === 'connected' && !isReconnecting) {
      if (needsChainSwitch && currentChainId !== requiredChain.chainId) handleChainSwitch();
      else { setChainState('success'); goToNextStep(ComponentStep, reviewState); }
    }
  }, [reviewState, chainState, needsChainSwitch, currentChainId, requiredChain.chainId, wagmiStatus, isReconnecting, handleChainSwitch, goToNextStep]);

  useEffect(() => () => clearPendingTimeout(), [clearPendingTimeout]);

  const handleRetry = () => { if (chainState === 'error') { switchAttempted.current = false; setChainState('pending'); } };

  const isError = !hasSucceeded && chainState === 'error';
  const showCancel = !hasSucceeded && (chainState === 'pending' || chainState === 'error');
  const statusVar = isError ? 'var(--widget-status-failed)' : 'var(--widget-primary)';

  return (
    <div className="flex w-full flex-row justify-between space-x-3">
      <button
        type="button"
        className={`inline-flex h-12 w-full items-center justify-center text-sm font-sans font-medium transition duration-150 ${isError ? 'cursor-pointer' : 'cursor-not-allowed'}`}
        style={{
          backgroundColor: `color-mix(in srgb, ${statusVar} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${statusVar} 20%, transparent)`,
          color: statusVar,
          borderRadius: 'var(--widget-radius)',
        }}
        onClick={isError ? handleRetry : undefined}
      >
        <div className="flex h-10 w-full flex-row items-center space-x-3 px-4">
          <ChainIcon chain={requiredChain.chainId} size="xs" />
          <p className="whitespace-nowrap">{isError ? 'Retry Switch' : `Switch to ${requiredChain.name}`}</p>
          <div className="flex flex-1 border-t" style={{ borderColor: 'var(--widget-border)' }} />
          <div className="flex h-6 w-3 items-center justify-center rounded-full">
            {!hasSucceeded && chainState === 'pending' && <LoadingSpinner size="5" />}
            {(hasSucceeded || chainState === 'success') && <Checkmark className="h-8 w-8" />}
            {isError && <RedoIcon className="h-[12px] w-[12px]" />}
          </div>
        </div>
      </button>
      {showCancel && (
        <button
          type="button"
          className="inline-flex h-12 items-center justify-center px-8 text-sm font-sans font-medium transition duration-150 cursor-pointer"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--widget-status-failed) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--widget-status-failed) 20%, transparent)',
            color: 'var(--widget-status-failed)',
            borderRadius: 'var(--widget-radius)',
          }}
          onClick={cancel}
        >
          Cancel
        </button>
      )}
    </div>
  );
};

export default ReviewActionChainSwitchRow;
