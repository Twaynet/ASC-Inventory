'use client';

import { useCallback, useState } from 'react';
import { useScanner, ScanResult } from './useScanner';
import { createDeviceEvent, type InventoryItemDetail } from './api';

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
 * LAW COMPLIANCE (device-events.md §6, physical-devices.md):
 * - Device events trigger LOOKUP only, not automatic VERIFIED events
 * - Human confirmation is required before creating inventory events
 *
 * When a barcode is scanned:
 * 1. Detects the scan via useScanner
 * 2. Sends device event to API (returns candidate item, NO auto-verify)
 * 3. Returns the candidate to the UI for human confirmation
 * 4. User must explicitly call createInventoryEvent to create VERIFIED event
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
      // Send device event to API - returns candidate item for display
      // LAW COMPLIANCE: No automatic VERIFIED event is created
      const deviceResponse = await createDeviceEvent(token, {
        deviceId: KEYBOARD_WEDGE_DEVICE_ID,
        deviceType: 'barcode',
        payloadType: 'scan',
        rawValue: scanResult.value,
      });

      // Use candidate directly from response (no separate API call needed)
      const item: InventoryItemDetail | null = deviceResponse.candidate;

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
