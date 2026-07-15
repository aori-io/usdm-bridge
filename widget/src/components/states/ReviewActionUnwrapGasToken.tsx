'use client';

import { useEmitBalanceEvent } from '../../hooks/useBalanceEventListener';
import { useUnwrapToken } from '../../queries/useUnwrapToken';
import { Checkmark, LoadingSpinner, RedoIcon, getChainConfig, isReviewStepPast, NATIVE_ASSET_ADDRESS, type SupportedChainId, type Asset, type ReviewOrderStep } from '../../internal';
import { useWalletState } from '../../wallet/useWalletState';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { parseUnits } from 'viem';
import { useAccount, useWriteContract } from 'wagmi';

type UnwrappingState = 'idle' | 'pending' | 'error' | 'success';

const WALLET_TIMEOUT_MS = 15_000;

interface ReviewActionUnwrapGasTokenProps {
  needsToUnwrap: boolean;
  amount: number;
  chainId: SupportedChainId;
  token?: Asset;
  reviewState: ReviewOrderStep | null;
  setReviewState: (state: ReviewOrderStep | null) => void;
  goToNextStep: (componentStep: ReviewOrderStep, currentStep: ReviewOrderStep | null) => void;
  cancel: () => Promise<void>;
  delayedClose: () => Promise<void>;
}

const ComponentStep: ReviewOrderStep = 'unwrapping';

const ReviewActionUnwrapGasToken: React.FC<ReviewActionUnwrapGasTokenProps> = ({
  needsToUnwrap, amount, chainId, token, reviewState, setReviewState, goToNextStep, cancel, delayedClose,
}) => {
  const hasSucceeded = isReviewStepPast(ComponentStep, reviewState);
  const [unwrappingState, setUnwrappingState] = useState<UnwrappingState>('idle');
  const unwrapMutation = useUnwrapToken();
  const { writeContractAsync } = useWriteContract();
  const { address } = useWalletState();
  const emitBalanceEvent = useEmitBalanceEvent();
  const isUnwrapping = useRef(false);
  const unwrapAttempted = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { status: wagmiStatus } = useAccount();

  const clearPendingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleUnwrap = useCallback(async () => {
    if (isUnwrapping.current || unwrapAttempted.current || !address || wagmiStatus !== 'connected') return;
    isUnwrapping.current = true;
    unwrapAttempted.current = true;
    setUnwrappingState('pending');

    timeoutRef.current = setTimeout(() => {
      if (isUnwrapping.current) {
        setUnwrappingState('error');
        isUnwrapping.current = false;
      }
    }, WALLET_TIMEOUT_MS);

    try {
      const chainConfig = getChainConfig(chainId);
      if (!chainConfig) throw new Error(`No config for chain ${chainId}`);
      const wrappedDecimals = chainConfig.wrappedAsset.decimals ?? chainConfig.nativeAsset.decimals;
      const amountRaw = parseUnits(amount.toString(), wrappedDecimals);
      await unwrapMutation.mutateAsync({
        chainId, accountAddress: address as `0x${string}`, amountRaw, writeContractAsync,
      });
      const nativeAsset: Asset = {
        symbol: chainConfig.nativeAsset.symbol, name: chainConfig.nativeAsset.name,
        address: NATIVE_ASSET_ADDRESS, decimals: chainConfig.nativeAsset.decimals, chainId,
      };
      const wrappedAsset: Asset = {
        symbol: chainConfig.wrappedAsset.symbol, name: chainConfig.wrappedAsset.name,
        address: chainConfig.wrappedAsset.address, decimals: chainConfig.wrappedAsset.decimals, chainId,
      };
      emitBalanceEvent({
        type: 'unwrap',
        tokens: [
          { asset: nativeAsset, userAddress: address },
          { asset: wrappedAsset, userAddress: address },
        ],
      });
      clearPendingTimeout();
      setUnwrappingState('success');
      goToNextStep(ComponentStep, reviewState);
      await delayedClose();
    } catch {
      clearPendingTimeout();
      setUnwrappingState('error');
    } finally {
      isUnwrapping.current = false;
    }
  }, [address, wagmiStatus, chainId, amount, unwrapMutation, writeContractAsync, emitBalanceEvent, goToNextStep, reviewState, delayedClose, clearPendingTimeout]);

  useEffect(() => {
    if (isUnwrapping.current || unwrapAttempted.current) return;
    if (reviewState === ComponentStep && unwrappingState === 'idle' && wagmiStatus === 'connected') {
      if (needsToUnwrap) handleUnwrap();
      else { setUnwrappingState('success'); goToNextStep(ComponentStep, reviewState); }
    }
  }, [reviewState, unwrappingState, needsToUnwrap, wagmiStatus, handleUnwrap, goToNextStep]);

  useEffect(() => () => clearPendingTimeout(), [clearPendingTimeout]);

  const handleRetry = () => { if (unwrappingState === 'error') { unwrapAttempted.current = false; setUnwrappingState('idle'); } };

  const isError = !hasSucceeded && unwrappingState === 'error';
  const showCancel = !hasSucceeded && (unwrappingState === 'pending' || unwrappingState === 'idle' || unwrappingState === 'error');
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
          <p className="whitespace-nowrap">{isError ? 'Retry Unwrap' : token ? `Unwrap ${token.symbol}` : 'Unwrap Native Token'}</p>
          <div className="flex flex-1 border-t" style={{ borderColor: 'var(--widget-border)' }} />
          <div className="flex h-6 w-3 items-center justify-center rounded-full">
            {!hasSucceeded && (unwrappingState === 'pending' || unwrappingState === 'idle') && <LoadingSpinner size="5" />}
            {(hasSucceeded || unwrappingState === 'success') && <Checkmark className="h-8 w-8" />}
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

export default ReviewActionUnwrapGasToken;
