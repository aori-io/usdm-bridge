'use client';

import { useApproval } from '../../queries/useApproval';
import {
  Checkmark, LoadingSpinner, RedoIcon, TokenImage,
  isReviewStepPast, useAori,
  type Asset, type ReviewOrderStep,
} from '../../internal';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { maxUint256 } from 'viem';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';

type ApprovalState = 'pending' | 'error' | 'success';

interface ReviewActionApprovalRowProps {
  needsApproval: boolean;
  accountAddress: `0x${string}`;
  token: Asset;
  reviewState: ReviewOrderStep | null;
  goToNextStep: (componentStep: ReviewOrderStep, currentStep: ReviewOrderStep | null) => void;
  baseAmount: number;
  currentAllowance: number;
  cancel: () => Promise<void>;
}

const ComponentStep: ReviewOrderStep = 'approval';

const ReviewActionApprovalRow: React.FC<ReviewActionApprovalRowProps> = ({
  needsApproval,
  accountAddress,
  reviewState,
  token,
  goToNextStep,
  cancel,
  baseAmount,
  currentAllowance,
}) => {
  const hasSucceeded = isReviewStepPast(ComponentStep, reviewState);
  const [approvalState, setApprovalState] = useState<ApprovalState>('pending');
  const approveMutation = useApproval();
  const aori = useAori();
  const currentChainId = useChainId();
  const { isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const isApproving = useRef(false);
  const approvalAttempted = useRef(false);

  const handleApproval = useCallback(async () => {
    if (isApproving.current || approvalAttempted.current) return;
    isApproving.current = true;
    approvalAttempted.current = true;
    setApprovalState('pending');
    try {
      const spender = aori?.getChain(token.chainId)?.address;
      if (!spender) throw new Error('Spender address not found');

      if (currentChainId !== token.chainId) {
        try {
          await switchChain({ chainId: token.chainId });
        } catch {
          throw new Error(
            `Please switch to ${token.symbol}'s network (Chain ID: ${token.chainId}) to approve`,
          );
        }
      }

      // After a chain switch the connector briefly drops — wait until reconnected
      const deadline = Date.now() + 5000;
      while (!isConnected && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!isConnected) {
        throw new Error('Wallet disconnected after chain switch — please reconnect and retry');
      }

      await approveMutation.mutateAsync({
        tokenAddress: token.address as `0x${string}`,
        allowanceRaw: maxUint256.toString(),
        chainId: token.chainId,
        spenderAddress: spender as `0x${string}`,
        accountAddress,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      setApprovalState('success');
      goToNextStep(ComponentStep, reviewState);
    } catch {
      setApprovalState('error');
    } finally {
      isApproving.current = false;
    }
  }, [token, accountAddress, goToNextStep, reviewState, approveMutation, aori, currentChainId, switchChain, isConnected]);

  useEffect(() => {
    if (isApproving.current || approvalAttempted.current) return;

    const shouldApprove =
      reviewState === ComponentStep &&
      approvalState === 'pending' &&
      needsApproval &&
      baseAmount > currentAllowance;

    if (shouldApprove) {
      handleApproval();
    } else if (!needsApproval || baseAmount <= currentAllowance) {
      setApprovalState('success');
      goToNextStep(ComponentStep, reviewState);
    }
  }, [reviewState, approvalState, needsApproval, baseAmount, currentAllowance, handleApproval, goToNextStep]);

  const handleRetry = () => {
    if (approvalState === 'error') {
      approvalAttempted.current = false;
      setApprovalState('pending');
    }
  };

  const isError = !hasSucceeded && approvalState === 'error';
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
          <TokenImage asset={token} size="xs" noChain />
          <p className="whitespace-nowrap">
            {isError ? 'Retry Approval' : `Approve ${token.symbol}`}
          </p>
          <div className="flex flex-1 border-t" style={{ borderColor: 'var(--widget-border)' }} />
          <div className="flex h-6 w-3 items-center justify-center rounded-full">
            {!hasSucceeded && approvalState === 'pending' && <LoadingSpinner size="5" />}
            {(hasSucceeded || approvalState === 'success') && <Checkmark className="h-8 w-8" />}
            {isError && <RedoIcon className="h-[12px] w-[12px]" />}
          </div>
        </div>
      </button>
      {isError && (
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

export default ReviewActionApprovalRow;
