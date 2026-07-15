'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Simple text scramble hook for placeholder text animations
 * Designed for use in form inputs when switching between placeholder and error messages
 */
export const useSimpleTextScramble = (
  targetText: string,
  duration: number = 25,
) => {
  const [displayText, setDisplayText] = useState(targetText);
  const [isScrambling, setIsScrambling] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const displayTextRef = useRef(displayText);
  displayTextRef.current = displayText;
  const charset = 'abcdefghijklmnopqrstuvwxyz';

  const randomChars = (length: number) => {
    let result = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      result += charset[randomIndex];
    }
    return result;
  };

  useEffect(() => {
    if (targetText === displayTextRef.current) return;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setIsScrambling(true);
    let revealedChars = 0;

    const scrambleIteration = () => {
      if (revealedChars >= targetText.length) {
        setDisplayText(targetText);
        setIsScrambling(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      const revealedPortion = targetText.substring(0, revealedChars);
      const remainingLength = Math.max(0, targetText.length - revealedChars);
      const scrambledSuffix =
        remainingLength > 0 ? randomChars(remainingLength) : '';

      setDisplayText(revealedPortion + scrambledSuffix);
      revealedChars++;
    };

    intervalRef.current = setInterval(scrambleIteration, duration);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [targetText, duration]);

  return {
    displayText,
    isScrambling,
  };
};

/**
 * Advanced text scramble hook with color transitions - used in SwapHeader
 * Supports error state styling and more complex animations
 */
export const useTextScramble = (
  targetText: string,
  isTargetError: boolean,
  duration: number = 25,
) => {
  const [displayText, setDisplayText] = useState(targetText);
  const [suffix, setSuffix] = useState('');
  const [characterColors, setCharacterColors] = useState<boolean[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const charset = 'abcdefghijklmnopqrstuvwxyz';

  const randomChars = (length: number) => {
    let result = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      result += charset[randomIndex];
    }
    return result;
  };

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    let revealedChars = 0;

    const colorTransitionMap = new Array(targetText.length)
      .fill(false)
      .map((_, index) => {
        const baseDelay = index;
        const randomDelay = Math.floor(Math.random() * 3);
        return baseDelay + randomDelay;
      });

    const scrambleIteration = () => {
      if (revealedChars >= targetText.length) {
        setDisplayText(targetText);
        setSuffix('');
        setCharacterColors(new Array(targetText.length).fill(isTargetError));
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      const revealedPortion = targetText.substring(0, revealedChars);
      const remainingLength = Math.max(0, targetText.length - revealedChars);
      const scrambledSuffix =
        remainingLength > 0 ? randomChars(remainingLength) : '';

      const newCharacterColors = new Array(targetText.length)
        .fill(false)
        .map((_, index) => {
          if (index < revealedChars) {
            const shouldTransition = revealedChars >= colorTransitionMap[index];
            return shouldTransition ? isTargetError : false;
          }
          return false;
        });

      setDisplayText(revealedPortion);
      setSuffix(scrambledSuffix);
      setCharacterColors(newCharacterColors);

      revealedChars++;
    };

    intervalRef.current = setInterval(scrambleIteration, duration);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [targetText, isTargetError, duration]);

  return {
    displayText,
    suffix,
    characterColors,
  };
};
