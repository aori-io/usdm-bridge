import { getAddress } from 'viem';
import type { ReviewOrderStep } from './types';
import { ReviewOrderSteps, reviewOrderStepToIndex } from './types';

export const formatNumber = (
  num: number | string | null | undefined,
): string => {
  const numValue = typeof num === 'number' ? num : Number(num);

  if (Number.isNaN(numValue)) {
    return 'N/A';
  }

  if (Math.abs(numValue) >= 1_000_000_000_000) {
    return `${(numValue / 1_000_000_000_000).toFixed(3)}T`;
  }
  if (Math.abs(numValue) >= 1_000_000_000) {
    return `${(numValue / 1_000_000_000).toFixed(3)}B`;
  }
  if (Math.abs(numValue) >= 999_950) {
    return `${(numValue / 1_000_000).toFixed(3)}M`;
  }
  if (Math.abs(numValue) >= 10_000) {
    return `${(numValue / 1_000).toFixed(3)}K`;
  }
  if (Math.abs(numValue) >= 1_000) {
    return numValue.toFixed(2);
  }
  if (Math.abs(numValue) >= 100) {
    return numValue.toFixed(2);
  }
  if (Math.abs(numValue) >= 10) {
    return numValue.toFixed(2);
  }
  if (Math.abs(numValue) >= 1) {
    return numValue.toFixed(2);
  }
  return numValue.toFixed(6);
};

export const TruncateString = (str: string): string => {
  if (typeof str !== 'string' || !str) {
    return 'Invalid String';
  }

  const split_str = str.split('');
  const first = split_str.slice(0, 5).join('');
  const last = split_str.slice(-5).join('');
  return `${first}…${last}`;
};

export function toBigInt(
  value: string | number | bigint,
  _decimals?: number,
): bigint {
  if (typeof value === 'bigint') return value;
  if (
    typeof value === 'number' ||
    (typeof value === 'string' && (value.includes('e') || value.includes('E')))
  ) {
    return BigInt(Math.floor(Number(value)));
  }
  if (typeof value === 'string' && value.startsWith('0x')) {
    return BigInt(value);
  }
  return BigInt(value);
}

export { isAddress } from 'viem';

export const isReviewStepPast = (
  componentStep: ReviewOrderStep | null,
  currentReviewState: ReviewOrderStep | null,
): boolean => {
  if (componentStep === null) return true;
  if (currentReviewState === null) return false;
  return (
    reviewOrderStepToIndex[currentReviewState] >
    reviewOrderStepToIndex[componentStep]
  );
};

export const getNextReviewStep = (
  current: ReviewOrderStep | null,
): ReviewOrderStep | null => {
  if (current === null) return null;
  return ReviewOrderSteps[reviewOrderStepToIndex[current] + 1] || null;
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const calculateDollarizedBalance = (
  asset: { price?: number },
  amount: string,
  decimals: number,
): number => {
  const balance = Number.parseFloat(amount) / 10 ** decimals;
  const price = asset.price || 0;
  return balance * price;
};

const memoizedAddresses = new Map<unknown, `0x${string}` | ''>();

function checkedAddress(candidate: `0x${string}`): `0x${string}`;
function checkedAddress(candidate: unknown): `0x${string}` | '';
function checkedAddress(candidate: unknown): `0x${string}` | '' {
  const memoizedAddress = memoizedAddresses.get(candidate);
  if (typeof memoizedAddress !== 'string') {
    try {
      const address = getAddress(candidate as string) as `0x${string}`;
      memoizedAddresses.set(candidate, address);
      return address;
    } catch {
      memoizedAddresses.set(candidate, '');
      return '';
    }
  } else {
    return memoizedAddress;
  }
}

export { checkedAddress };
