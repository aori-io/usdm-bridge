'use client';

import { TruncateString } from '../helpers';
import React, { useState, useEffect, useRef } from 'react';
import Checkmark from '../animations/Checkmark';
import { ClipboardIcon } from '../icons/ClipboardIcon';

interface CopyTextProps {
  text: string;
  type: 'address' | 'link' | 'hash' | 'pair' | 'data' | 'default';
  color?: 'white' | 'teal' | 'black';
  size?: string;
  font?: string;
  className?: string;
  children?: React.ReactNode;
  showCopyIcon?: boolean;
  disableScramble?: boolean;
}

const useCopyTextScramble = (targetText: string, isError: boolean) => {
  const [displayText, setDisplayText] = useState('');
  const [suffix, setSuffix] = useState('');
  const [characterColors, setCharacterColors] = useState<boolean[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const charset = 'abcdefghijklmnopqrstuvwxyz';

  const randomChars = (length: number) => {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset[Math.floor(Math.random() * charset.length)];
    }
    return result;
  };

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    let revealedChars = 0;
    const scrambleIteration = () => {
      if (revealedChars >= targetText.length) {
        setDisplayText(targetText);
        setSuffix('');
        setCharacterColors(new Array(targetText.length).fill(isError));
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        return;
      }
      const revealedPortion = targetText.substring(0, revealedChars);
      const remainingLength = Math.max(0, targetText.length - revealedChars);
      const scrambledSuffix = remainingLength > 0 ? randomChars(remainingLength) : '';
      const newCharacterColors = new Array(targetText.length).fill(false).map((_, index) => index < revealedChars ? isError : false);
      setDisplayText(revealedPortion);
      setSuffix(scrambledSuffix);
      setCharacterColors(newCharacterColors);
      revealedChars++;
    };
    intervalRef.current = setInterval(scrambleIteration, 25);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [targetText, isError]);

  return { displayText, suffix, characterColors };
};

const TextScrambleDisplay = ({ targetText, isError, font = '' }: { targetText: string; isError: boolean; font?: string }) => {
  const { displayText, suffix, characterColors } = useCopyTextScramble(targetText, isError);
  return (
    <span className={font}>
      {displayText.split('').map((char, index) => (
        <span key={`revealed-${index}`} style={characterColors[index] ? { color: 'var(--widget-destructive)' } : undefined}>{char}</span>
      ))}
      {suffix && <span style={{ color: 'var(--widget-muted-foreground)', opacity: 0.3 }}>{suffix}</span>}
    </span>
  );
};

const CopyText: React.FC<CopyTextProps> = ({
  text, type, color = 'white', size = 'text-base', font = 'font-medium',
  className = '', children, showCopyIcon = true, disableScramble = false,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => { if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; } };
  }, []);

  const handleCopy = () => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    navigator.clipboard.writeText(text).then(() => {
      setIsCopied(true);
      timeoutRef.current = setTimeout(() => { setIsCopied(false); timeoutRef.current = null; }, 2000);
    }).catch(() => {
      setCopyError('Failed to copy');
      timeoutRef.current = setTimeout(() => { setCopyError(''); timeoutRef.current = null; }, 3000);
    });
  };

  const colorClass = color === 'teal' ? 'text-textSuccess' : 'text-text';

  const getDisplayText = () => {
    if (copyError) return copyError;
    if (isCopied) {
      switch (type) {
        case 'address': return 'Address Copied!';
        case 'hash': return 'Hash Copied!';
        case 'link': return 'Link Copied!';
        case 'pair': return 'Pair Copied!';
        case 'data': return 'Data Copied!';
        default: return 'Copied!';
      }
    }
    return children ? '' : type === 'address' || type === 'hash' ? TruncateString(text) : text;
  };

  const displayText = getDisplayText();
  const isErrorState = !!copyError;
  const scrambleKey = `${isCopied}-${copyError}-${text}`;

  return (
    <div className="relative">
      <button
        type="button"
        className={`relative flex cursor-pointer items-center bg-transparent border-none p-0 ${className} ${color === 'black' ? 'px-4 rounded-full h-8 bg-gray-800' : ''}`}
        onClick={(e) => { e.stopPropagation(); handleCopy(); }}
      >
        <span className={`flex items-center gap-0.5 ${colorClass} ${size} ${font}`}>
          {copyError || isCopied ? (
            disableScramble ? displayText : (
              <span key={scrambleKey}>
                <TextScrambleDisplay targetText={displayText} isError={isErrorState} font={font} />
              </span>
            )
          ) : (children ?? displayText)}
          {showCopyIcon && !copyError && (
            <div className="relative ml-1 h-3 w-3">
              <ClipboardIcon className={`absolute inset-0 ${!isCopied ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200 ${font}`} />
              <div className={`absolute inset-0 ${isCopied ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200`}>
                <Checkmark className="h-3 w-3" />
              </div>
            </div>
          )}
        </span>
      </button>
    </div>
  );
};

export default CopyText;
