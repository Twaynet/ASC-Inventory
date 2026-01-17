'use client';

import { useCallback, useState } from 'react';
import { useScanner, ScanResult } from './useScanner';
import { createDeviceEvent, getInventoryItem, type InventoryItemDetail } from './api';

// Well-known device ID for keyboard wedge input (matches backend constant)
const KEYBOARD_WEDGE_DEVICE_ID = '00000000-0000-0000-0000-000000000000';

export interface ScanProcessResult {
  rawValue: string;
  timestamp: Date;
  processed: boolean;
  item: InventoryItemDetail | null;
  error: string | null;
  deviceEventId: string | null;
}

export interface UseScannerServiceOptions {
  token: string | null;
  enabled?: boolean;
  onScanProcessed?: (result: ScanProcessResult) => void;
}

/**
 * Scanner service hook that combines keyboard wedge detection with API processing.
 *
 * When a barcode is scanned:
 * 1. Detects the scan via useScanner
 * 2. Sends device event to API (creates VERIFIED event if item found)
 * 3. Fetches full item details if processed successfully
 * 4. Returns the result to the caller
 */
export function useScannerService(options: UseScannerServiceOptions) {
  const { token, enabled = true, onScanProcessed } = options;

  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<ScanProcessResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanProcessResult[]>([]);

  const processScan = useCallback(async (scanResult: ScanResult) => {
    if (!token) {
      const result: ScanProcessResult = {
        rawValue: scanResult.value,
        timestamp: scanResult.timestamp,
        processed: false,
        item: null,
        error: 'Not authenticated',
        deviceEventId: null,
      };
      setLastResult(result);
      onScanProcessed?.(result);
      return;
    }

    setIsProcessing(true);

    try {
      // Send device event to API
      const deviceResponse = await createDeviceEvent(token, {
        deviceId: KEYBOARD_WEDGE_DEVICE_ID,
        deviceType: 'barcode',
        payloadType: 'scan',
        rawValue: scanResult.value,
      });

      let item: InventoryItemDetail | null = null;

      // If the scan was processed (item found), fetch full details
      if (deviceResponse.processed && deviceResponse.processedItemId) {
        try {
          const itemResponse = await getInventoryItem(token, deviceResponse.processedItemId);
          item = itemResponse.item;
        } catch {
          // Item fetch failed, but scan was still processed
        }
      }

      const result: ScanProcessResult = {
        rawValue: scanResult.value,
        timestamp: scanResult.timestamp,
        processed: deviceResponse.processed,
        item,
        error: deviceResponse.error || null,
        deviceEventId: deviceResponse.deviceEventId,
      };

      setLastResult(result);
      setScanHistory(prev => [result, ...prev].slice(0, 50)); // Keep last 50 scans
      onScanProcessed?.(result);
    } catch (err) {
      const result: ScanProcessResult = {
        rawValue: scanResult.value,
        timestamp: scanResult.timestamp,
        processed: false,
        item: null,
        error: err instanceof Error ? err.message : 'Failed to process scan',
        deviceEventId: null,
      };
      setLastResult(result);
      setScanHistory(prev => [result, ...prev].slice(0, 50));
      onScanProcessed?.(result);
    } finally {
      setIsProcessing(false);
    }
  }, [token, onScanProcessed]);

  const scanner = useScanner({
    enabled: enabled && !!token,
    onScan: processScan,
  });

  const clearLastResult = useCallback(() => {
    setLastResult(null);
  }, []);

  const clearHistory = useCallback(() => {
    setScanHistory([]);
  }, []);

  return {
    // Scanner state
    isCapturing: scanner.isCapturing,
    isProcessing,

    // Results
    lastResult,
    scanHistory,

    // Actions
    clearLastResult,
    clearHistory,

    // Manual scan (for testing or manual barcode entry)
    manualScan: (value: string) => {
      processScan({ value, timestamp: new Date() });
    },
  };
}
