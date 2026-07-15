'use client';

import { useEmitBalanceEvent } from '../../hooks/useBalanceEventListener';
import { useWrapToken } from '../../queries/useWrapToken';
import { Checkmark, LoadingSpinner, RedoIcon, TokenImage, getChainConfig, isReviewStepPast, NATIVE_ASSET_ADDRESS, type SupportedChainId, type Asset, type ReviewOrderStep } from '../../internal';
import { useWalletState } from '../../wallet/useWalletState';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { parseUnits } from 'viem';
import { useAccount, useWriteContract } from 'wagmi';

type WrappingState = 'idle' | 'pending' | 'error' | 'success';

const WALLET_TIMEOUT_MS = 15_000;

interface ReviewActionWrapGasTokenProps {
  needsToWrap: boolean;
  amount: number;
  chainId: SupportedChainId;
  token?: Asset;
  reviewState: ReviewOrderStep | null;
  setReviewState: (state: ReviewOrderStep | null) => void;
  goToNextStep: (componentStep: ReviewOrderStep, currentStep: ReviewOrderStep | null) => void;
  cancel: () => Promise<void>;
  delayedClose: () => Promise<void>;
  isWrappingPair: boolean;
}

const ComponentStep: ReviewOrderStep = 'wrapping';

const ReviewActionWrapGasToken: React.FC<ReviewActionWrapGasTokenProps> = ({
  needsToWrap, amount, chainId, token, reviewState, setReviewState, goToNextStep, cancel, delayedClose, isWrappingPair,
}) => {
  const hasSucceeded = isReviewStepPast(ComponentStep, reviewState);
  const [wrappingState, setWrappingState] = useState<WrappingState>('idle');
  const wrapMutation = useWrapToken();
  const { writeContractAsync } = useWriteContract();
  const { address } = useWalletState();
  const emitBalanceEvent = useEmitBalanceEvent();
  const isWrapping = useRef(false);
  const wrapAttempted = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { status: wagmiStatus } = useAccount();

  const clearPendingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleWrap = useCallback(async () => {
    if (isWrapping.current || wrapAttempted.current || !address || wagmiStatus !== 'connected') return;
    isWrapping.current = true;
    wrapAttempted.current = true;
    setWrappingState('pending');

    timeoutRef.current = setTimeout(() => {
      if (isWrapping.current) {
        setWrappingState('error');
        isWrapping.current = false;
      }
    }, WALLET_TIMEOUT_MS);

    try {
      const chainConfig = getChainConfig(chainId);
      if (!chainConfig) throw new Error(`No config for chain ${chainId}`);
      const amountRaw = parseUnits(amount.toString(), chainConfig.nativeAsset.decimals);
      await wrapMutation.mutateAsync({
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
        type: 'wrap',
        tokens: [
          { asset: nativeAsset, userAddress: address },
          { asset: wrappedAsset, userAddress: address },
        ],
      });
      clearPendingTimeout();
      setWrappingState('success');
      goToNextStep(ComponentStep, reviewState);
      if (isWrappingPair) await delayedClose();
    } catch {
      clearPendingTimeout();
      setWrappingState('error');
    } finally {
      isWrapping.current = false;
    }
  }, [address, wagmiStatus, chainId, amount, wrapMutation, writeContractAsync, emitBalanceEvent, goToNextStep, reviewState, delayedClose, isWrappingPair, clearPendingTimeout]);

  useEffect(() => {
    if (isWrapping.current || wrapAttempted.current) return;
    if (reviewState === ComponentStep && wrappingState === 'idle' && wagmiStatus === 'connected') {
      if (needsToWrap) handleWrap();
      else { setWrappingState('success'); goToNextStep(ComponentStep, reviewState); }
    }
  }, [reviewState, wrappingState, needsToWrap, wagmiStatus, handleWrap, goToNextStep]);

  useEffect(() => () => clearPendingTimeout(), [clearPendingTimeout]);

  const handleRetry = () => { if (wrappingState === 'error') { wrapAttempted.current = false; setWrappingState('idle'); } };

  const isError = !hasSucceeded && wrappingState === 'error';
  const showCancel = !hasSucceeded && (wrappingState === 'pending' || wrappingState === 'idle' || wrappingState === 'error');
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
          <p className="whitespace-nowrap">{isError ? 'Retry Wrap' : token ? `Wrap ${token.symbol}` : 'Wrap Native Token'}</p>
          <div className="flex flex-1 border-t" style={{ borderColor: 'var(--widget-border)' }} />
          <div className="flex h-6 w-3 items-center justify-center rounded-full">
            {!hasSucceeded && (wrappingState === 'pending' || wrappingState === 'idle') && <LoadingSpinner size="5" />}
            {(hasSucceeded || wrappingState === 'success') && <Checkmark className="h-8 w-8" />}
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

export default ReviewActionWrapGasToken;
