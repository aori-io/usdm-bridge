'use client';

import { useWalletScreening } from '../context/WalletScreeningContext';

export function WalletBlockedBanner() {
  const { isBlocked } = useWalletScreening();

  if (!isBlocked) return null;

  return (
    <div
      className="w-full px-4 py-3 text-center text-sm font-medium"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--widget-destructive) 10%, transparent)',
        color: 'var(--widget-destructive)',
        borderRadius: 'var(--widget-radius)',
        border: '1px solid color-mix(in srgb, var(--widget-destructive) 20%, transparent)',
      }}
    >
      This wallet address cannot use this service.
    </div>
  );
}
