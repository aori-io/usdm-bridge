'use client';

import type { Asset } from '../internal';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWidgetConfig } from '../context/WidgetConfigContext';
import { useSwapFormContext } from '../providers/SwapFormProvider';

const MAX_INPUT_LENGTH = 20;

interface AssetAmountInputProps {
  side: 'base' | 'quote';
  asset: Asset | null;
  otherAsset?: Asset | null;
  isPlacingOrder: boolean;
  isWrappingPair: boolean;
  isUnwrappingPair: boolean;
}

const AssetAmountInput: React.FC<AssetAmountInputProps> = ({
  side,
  asset,
  otherAsset,
  isPlacingOrder,
  isWrappingPair,
  isUnwrappingPair,
}) => {
  const { baseAmount, quoteAmount, setBaseAmount, setQuoteAmount } =
    useSwapFormContext();
  const { amountInputVariant, hideAmountInputSymbol, widgetType } =
    useWidgetConfig();
  const isCompactMode = widgetType === 'compact';
  const [setAssetAmount, setOtherAssetAmount] =
    side === 'base'
      ? [setBaseAmount, setQuoteAmount]
      : [setQuoteAmount, setBaseAmount];

  const disabled = !asset || side === 'quote' || isPlacingOrder;
  const maxFontSize = isCompactMode
    ? 32
    : amountInputVariant === 'default'
      ? 64
      : 32; // normal
  const [fontSize, setFontSize] = useState(maxFontSize);
  const [inputValue, setInputValue] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const symbolRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const placeholderText = 'USD';
  const assetAmount = side === 'base' ? baseAmount : quoteAmount;
  const [isMounted, setIsMounted] = useState(false);

  const adjustFontSize = useCallback(() => {
    if (amountInputVariant !== 'default') {
      setFontSize(maxFontSize);
      return;
    }
    if (!containerRef.current || !measureRef.current || !symbolRef.current)
      return;
    const containerWidth = containerRef.current.offsetWidth;
    const padding = 20;
    let newFontSize = maxFontSize;
    while (newFontSize > 20) {
      measureRef.current.style.fontSize = `${newFontSize}px`;
      symbolRef.current.style.fontSize = `${newFontSize}px`;
      const totalWidth =
        measureRef.current.offsetWidth +
        symbolRef.current.offsetWidth +
        padding;
      if (totalWidth <= containerWidth) break;
      newFontSize -= 1;
    }
    setFontSize(newFontSize);
  }, [amountInputVariant, maxFontSize]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === '.' && inputValue.includes('.')) e.preventDefault();
    },
    [inputValue],
  );

  const handleAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let newValue = e.target.value;
      if (newValue === '.') newValue = '0.';
      if (!/^\d*\.?\d*$/.test(newValue)) return;
      if ((newValue.match(/\./g) || []).length > 1) return;
      if (newValue.length > 1 && newValue[0] === '0' && newValue[1] !== '.') {
        newValue = newValue.replace(/^0+/, '') || '0';
      }
      if (asset?.decimals !== undefined && newValue.includes('.')) {
        const [, fracPart] = newValue.split('.');
        if (fracPart && fracPart.length > asset.decimals) return;
      }
      if (newValue.length > MAX_INPUT_LENGTH) return;

      setInputValue(newValue);
      const newAmount = parseFloat(newValue);

      if (newValue !== inputValue) {
        if (newValue === '' || newValue === '0.' || newValue.endsWith('.')) {
          setAssetAmount(null);
          if (side === 'base') setOtherAssetAmount(null);
        } else if (!Number.isNaN(newAmount) && newAmount >= 0) {
          setAssetAmount(newAmount);
        }
        if (side === 'base') setQuoteAmount(null);
        if (isUnwrappingPair || isWrappingPair) setQuoteAmount(newAmount || 0);
      }
    },
    [
      inputValue,
      setAssetAmount,
      side,
      setQuoteAmount,
      asset?.decimals,
      setOtherAssetAmount,
      isUnwrappingPair,
      isWrappingPair,
    ],
  );

  useEffect(() => {
    const formatAmount = (amount: number | null) => {
      if (amount === null) return '';
      const decimals = asset?.decimals;
      if (decimals === undefined) return '';
      let asString = amount.toString();
      if (/e/i.test(asString)) {
        asString = Number(amount).toLocaleString('en-US', {
          useGrouping: false,
          maximumFractionDigits: decimals,
        });
      }
      if (asString.includes('.')) {
        const [intPart, fracPartRaw] = asString.split('.');
        const fracPart = fracPartRaw.slice(0, decimals);
        return fracPart ? `${intPart}.${fracPart}` : intPart;
      }
      return asString;
    };

    if (assetAmount === null) {
      const isTypingDecimal =
        inputValue === '0.' || (inputValue !== '' && inputValue.endsWith('.'));
      if (!isTypingDecimal) setInputValue('');
      return;
    }

    const isUserTyping =
      !disabled &&
      (inputValue.endsWith('.') ||
        inputValue.match(/\.\d*0$/) ||
        inputValue === '0' ||
        inputValue === '0.');
    if (isUserTyping && inputValue !== '') return;

    const currentNumericValue = parseFloat(inputValue) || 0;
    if (
      inputValue === '' ||
      Math.abs(currentNumericValue - assetAmount) > 0.0000000001
    ) {
      setInputValue(formatAmount(assetAmount));
    }
  }, [assetAmount, asset?.decimals, inputValue, disabled]);

  useEffect(() => {
    adjustFontSize();
  }, [inputValue, adjustFontSize]);
  useEffect(() => {
    setIsMounted(true);
  }, []);
  useEffect(() => {
    if (isMounted) adjustFontSize();
  }, [isMounted, adjustFontSize]);
  useEffect(() => {
    if (measureRef.current && inputRef.current) {
      inputRef.current.style.width = `${measureRef.current.offsetWidth}px`;
    }
  }, [inputValue]);

  useEffect(() => {
    if (!isMounted) return;
    const resizeObserver = new ResizeObserver(() => {
      if (isMounted) adjustFontSize();
    });
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [isMounted, adjustFontSize]);

  return (
    <div
      ref={containerRef}
      style={{
        fontSize: `${fontSize}px`,
        transition: 'font-size 0.05s ease-in-out',
      }}
      className={`mt-2 box-border font-sans flex ${
        isCompactMode
          ? amountInputVariant === 'normal'
            ? 'h-12 my-1'
            : 'h-10 my-0.5'
          : amountInputVariant === 'normal'
            ? 'h-12 my-1'
            : 'h-20 my-1'
      } w-full flex-row items-center ${disabled ? 'cursor-default' : 'cursor-text'}`}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="relative flex w-full items-center">
        <label htmlFor={`${side}Amount`} className="sr-only">
          {side === 'base' ? 'Input token amount' : 'Output token amount'}
        </label>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          placeholder="0"
          autoComplete="off"
          id={`${side}Amount`}
          value={inputValue}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          onKeyDown={handleKeyDown}
          onChange={handleAmountChange}
          style={{
            transition: 'width 0.15s ease-in-out',
            color: disabled
              ? 'var(--widget-foreground)'
              : 'var(--widget-foreground)',
            WebkitTextFillColor: disabled
              ? 'var(--widget-foreground)'
              : 'var(--widget-foreground)',
            opacity: 1,
          }}
          className="flex min-w-[45px] whitespace-nowrap bg-transparent placeholder:opacity-50 font-sans font-thin"
          disabled={disabled}
        />
        <span
          style={{ transition: 'width 0.15s ease-in-out' }}
          ref={measureRef}
          className="pointer-events-none absolute flex whitespace-nowrap invisible"
        >
          {inputValue || 0}
        </span>
        {!hideAmountInputSymbol && amountInputVariant !== 'normal' && (
          <span
            ref={symbolRef}
            className="ml-2 font-thin uppercase"
            style={{
              color: 'var(--widget-foreground)',
              opacity: 0.5,
              fontSize: `${fontSize}px`,
            }}
          >
            {asset?.symbol
              ? asset.symbol.length > 6
                ? `${asset.symbol.slice(0, 6)}...`
                : asset.symbol
              : placeholderText}
          </span>
        )}
        {(hideAmountInputSymbol || amountInputVariant === 'normal') && (
          <span ref={symbolRef} className="hidden" />
        )}
      </div>
    </div>
  );
};

export default AssetAmountInput;
