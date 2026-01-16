'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

export interface ScanResult {
  value: string;
  timestamp: Date;
}

export interface UseScannerOptions {
  /** Maximum time between keystrokes to be considered scanner input (ms) */
  maxKeystrokeInterval?: number;
  /** Minimum length of scanned value to be valid */
  minLength?: number;
  /** Whether the scanner is enabled */
  enabled?: boolean;
  /** Callback when a scan is detected */
  onScan?: (result: ScanResult) => void;
}

/**
 * Hook for detecting keyboard wedge scanner input.
 *
 * Keyboard wedge scanners act as keyboards, rapidly sending characters
 * followed by Enter. This hook detects rapid keystroke sequences and
 * captures them as scans.
 *
 * Characteristics that distinguish scanner input from human typing:
 * - Characters arrive very rapidly (< 50ms between keystrokes)
 * - Input ends with Enter key
 * - No modifier keys (Shift for symbols is OK)
 */
export function useScanner(options: UseScannerOptions = {}) {
  const {
    maxKeystrokeInterval = 50,
    minLength = 3,
    enabled = true,
    onScan,
  } = options;

  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const bufferRef = useRef<string>('');
  const lastKeystrokeRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetBuffer = useCallback(() => {
    bufferRef.current = '';
    setIsCapturing(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleScan = useCallback((value: string) => {
    const result: ScanResult = {
      value,
      timestamp: new Date(),
    };
    setLastScan(result);
    onScan?.(result);
  }, [onScan]);

  useEffect(() => {
    if (!enabled) {
      resetBuffer();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const now = Date.now();
      const timeSinceLastKey = now - lastKeystrokeRef.current;

      // Ignore if user is typing in an input field
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Handle Enter key - submit if we have a buffer
      if (event.key === 'Enter') {
        if (bufferRef.current.length >= minLength) {
          event.preventDefault();
          handleScan(bufferRef.current);
        }
        resetBuffer();
        lastKeystrokeRef.current = now;
        return;
      }

      // Handle Escape - clear buffer
      if (event.key === 'Escape') {
        resetBuffer();
        lastKeystrokeRef.current = now;
        return;
      }

      // Only capture printable characters
      if (event.key.length !== 1) {
        return;
      }

      // If time since last keystroke is too long, this is likely human typing
      // Reset buffer and start fresh
      if (timeSinceLastKey > maxKeystrokeInterval && bufferRef.current.length > 0) {
        resetBuffer();
      }

      // Add character to buffer
      bufferRef.current += event.key;
      lastKeystrokeRef.current = now;

      // Show capturing state after a few characters
      if (bufferRef.current.length >= 2) {
        setIsCapturing(true);
      }

      // Set timeout to clear buffer if no more input comes
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        // If we have enough characters when timeout fires, treat as scan
        // (some scanners don't send Enter)
        if (bufferRef.current.length >= minLength) {
          handleScan(bufferRef.current);
        }
        resetBuffer();
      }, 200);
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, maxKeystrokeInterval, minLength, handleScan, resetBuffer]);

  return {
    /** The last successful scan result */
    lastScan,
    /** Whether scanner input is currently being captured */
    isCapturing,
    /** Clear the last scan result */
    clearLastScan: () => setLastScan(null),
    /** The current buffer contents (for debugging) */
    currentBuffer: bufferRef.current,
  };
}
