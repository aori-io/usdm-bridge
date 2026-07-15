'use client';

import React from 'react';

interface WidgetWalletMenuProps {
  selectedTab: 'wallet' | 'activity';
  onTabChange: (tab: 'wallet' | 'activity') => void;
}

export const WidgetWalletMenu: React.FC<WidgetWalletMenuProps> = ({ selectedTab, onTabChange }) => {
  return (
    <div
      className="w-full flex flex-row text-xs py-1 flex-shrink-0"
      style={{ backgroundColor: 'var(--widget-background)' }}
    >
      <span className="pr-2 font-sans" style={{ color: 'var(--widget-muted-foreground)', opacity: 0.4 }}>
        {'¬'}
      </span>
      <button
        type="button"
        onClick={() => onTabChange('wallet')}
        className="font-sans uppercase mr-4 cursor-pointer transition-colors"
        style={{ color: selectedTab === 'wallet' ? 'var(--widget-foreground)' : 'var(--widget-muted-foreground)' }}
      >
        Wallet
      </button>
      <span className="pr-2 font-sans" style={{ color: 'var(--widget-muted-foreground)', opacity: 0.4 }}>
        {'¬'}
      </span>
      <button
        type="button"
        onClick={() => onTabChange('activity')}
        className="font-sans uppercase cursor-pointer transition-colors"
        style={{ color: selectedTab === 'activity' ? 'var(--widget-foreground)' : 'var(--widget-muted-foreground)' }}
      >
        Activity
      </button>
    </div>
  );
};
