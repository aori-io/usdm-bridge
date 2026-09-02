'use client';

import { isSolanaAddress, isSolanaChain, isEvmAddress } from 'usdm-bridge-sdk';
import { UserIcon, isAddress, useDebounce } from '../internal';
import { makeGradient } from 'ethereum-gradient-base64';
import React, { useState, useEffect, useMemo } from 'react';
import { useTokenSelectionStore } from '../hooks/useTokenSelection';
import { useWidgetSwapUIStore } from '../stores/swapUIStore';

function validateRecipientAddress(address: string, destChainId?: number): { valid: boolean; error?: string } {
  if (destChainId != null && isSolanaChain(destChainId)) {
    if (isSolanaAddress(address)) return { valid: true };
    return { valid: false, error: 'Enter a valid Solana address...' };
  }
  if (isAddress(address) || isEvmAddress(address)) return { valid: true };
  return { valid: false, error: 'Invalid wallet address...' };
}

const RecipientForm = () => {
  const [recipient, setRecipient] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const debouncedValue = useDebounce(inputValue, 1000);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const quoteToken = useTokenSelectionStore((s) => s.quoteToken);
  const destChainId = useMemo(() => quoteToken?.chainId, [quoteToken]);

  useEffect(() => {
    useWidgetSwapUIStore.getState().setRecipient(recipient);
  }, [recipient]);

  useEffect(() => {
    if (recipient) setInputValue(recipient);
    else setInputValue('');
  }, [recipient]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (isError) {
      setIsError(false);
      setErrorMessage('');
      setRecipient(null);
    }
    setInputValue(value);
    if (value === '') setRecipient(null);
  };

  useEffect(() => {
    if (debouncedValue === '' || !debouncedValue) {
      setIsError(false);
      setErrorMessage('');
      setRecipient(null);
    } else {
      const { valid, error } = validateRecipientAddress(debouncedValue, destChainId);
      if (!valid) {
        setIsError(true);
        setErrorMessage(error ?? 'Invalid wallet address...');
        setRecipient(null);
        setInputValue('');
      } else {
        setIsError(false);
        setErrorMessage('');
        setRecipient(debouncedValue);
      }
    }
  }, [debouncedValue, destChainId]);

  useEffect(() => {
    if (isError) {
      const timeout = setTimeout(() => {
        setRecipient(null);
        setInputValue('');
        setIsError(false);
        setErrorMessage('');
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [isError]);

  const handleClear = () => {
    setRecipient(null);
    setInputValue('');
    setIsError(false);
    setErrorMessage('');
  };

  return (
    <div className="w-full">
      <div className="relative flex flex-row items-center">
        {/* Hidden password input to fool browser autofill */}
        <input
          type="password"
          style={{ display: 'none' }}
          aria-hidden="true"
          tabIndex={-1}
        />

        <label htmlFor="recipient-address" className="sr-only">
          Recipient wallet address
        </label>

        {/* Left avatar / icon */}
        <div
          className="absolute left-3 flex h-6 w-6 items-end justify-center overflow-hidden rounded-full"
          style={{ backgroundColor: 'var(--widget-secondary)' }}
        >
          {recipient && !isError ? (
            <img
              className="h-full w-full rounded-full object-cover"
              src={makeGradient(recipient)}
              alt="Recipient avatar"
            />
          ) : (
            <UserIcon
              className="h-5 w-5"
              style={{
                color: isError
                  ? 'var(--widget-destructive)'
                  : 'var(--widget-muted-foreground)',
              }}
            />
          )}
        </div>

        {/* "To:" label */}
        <div
          className="absolute left-12 top-1.5 -translate-y-1 text-xs font-medium opacity-60"
          style={{
            color: isError
              ? 'var(--widget-destructive)'
              : 'var(--widget-muted-foreground)',
          }}
          aria-hidden="true"
        >
          To:
        </div>

        {/* Address input */}
        <input
          id="recipient-address"
          className="font-sans block h-10 w-full items-center pl-12 pt-4 pr-8 text-xs"
          style={{
            backgroundColor: isError
              ? `color-mix(in srgb, var(--widget-destructive) 10%, transparent)`
              : 'transparent',
            color: isError
              ? 'var(--widget-destructive)'
              : 'var(--widget-foreground)',
            outline: 'none',
            opacity: isError ? 0.9 : 1,
          }}
          placeholder={
            isError
              ? errorMessage
              : destChainId != null && isSolanaChain(destChainId)
                ? 'Enter Solana recipient address...'
                : 'Enter recipient address...'
          }
          value={inputValue}
          onChange={handleInputChange}
          spellCheck={false}
          aria-invalid={isError}
          aria-describedby={isError ? 'recipient-error' : undefined}
        />

        {isError && (
          <span id="recipient-error" className="sr-only">
            {errorMessage}
          </span>
        )}

        {/* Clear button */}
        {recipient && !isError && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer flex items-center justify-center h-4 w-4 rounded-full transition-colors hover:[color:var(--widget-destructive)]"
            style={{ color: 'var(--widget-muted-foreground)' }}
            onClick={handleClear}
            aria-label="Clear recipient"
          >
            <svg className="h-2.5 w-2.5" viewBox="0 -0.5 21 21" fill="none">
              <g fill="currentColor" fillRule="evenodd">
                <polygon
                  points="375.0183 90 384 98.554 382.48065 100 373.5 91.446 364.5183 100 363 98.554 371.98065 90 363 81.446 364.5183 80 373.5 88.554 382.48065 80 384 81.446"
                  transform="translate(-363 -80)"
                />
              </g>
            </svg>
            <span className="sr-only">Clear recipient</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default RecipientForm;
