'use client';

import { CopyText, Skeleton } from '../../internal';
import { makeGradient } from 'ethereum-gradient-base64';
import React from 'react';

interface WidgetWalletCardProps {
  address: string;
  totalBalance: number;
  isLoading?: boolean;
}

export const WidgetWalletCard: React.FC<WidgetWalletCardProps> = ({
  address,
  totalBalance,
  isLoading = false,
}) => {
  const formatBalance = (balance: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(balance);

  return (
    <div className="p-2 w-full flex justify-center">
      <div
        className="relative w-full h-[140px] overflow-hidden"
        style={{
          borderRadius: 'var(--widget-radius)',
          border: '1px var(--widget-border-style) var(--widget-border)',
        }}
      >
        {/* Gradient background */}
        <div className="absolute inset-0 z-0">
          <img
            className="w-full h-full object-cover opacity-60"
            src={makeGradient(address)}
            alt="address gradient"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex h-full flex-col justify-between p-3">
          <div>
            <p className="text-2xs uppercase font-sans" style={{ color: 'var(--widget-muted-foreground)', opacity: 0.7 }}>
              Token Balance:
            </p>
            {isLoading ? (
              <Skeleton className="h-8 w-28 bg-white/10 rounded mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-0.5" style={{ color: 'var(--widget-foreground)' }}>
                {formatBalance(totalBalance)}
              </p>
            )}
          </div>
          <div className="flex items-center">
            <CopyText text={address} type="address">
              <p className="font-sans text-2xs" style={{ color: 'var(--widget-foreground)', opacity: 0.7 }}>
                {address}
              </p>
            </CopyText>
          </div>
        </div>
      </div>
    </div>
  );
};
