/**
 * GS1 Parser Tests
 *
 * Unit tests for barcode classification and GS1 AI parsing.
 */

import { describe, it, expect } from 'vitest';
import { classifyBarcode, parseGS1, parseGS1Date } from '../src/lib/gs1-parser.js';

describe('classifyBarcode', () => {
  it('detects GS1 DataMatrix by ]d2 prefix', () => {
    expect(classifyBarcode(']d2010734567890123410LOT123')).toBe('gs1-datamatrix');
  });

  it('detects GS1-128 by ]C1 prefix', () => {
    expect(classifyBarcode(']C1010734567890123410LOT123')).toBe('gs1-128');
  });

  it('detects GS1 by parenthesized format', () => {
    expect(classifyBarcode('(01)07345678901234(10)LOT123')).toBe('gs1-datamatrix');
  });

  it('detects GS1 by FNC1 delimiter', () => {
    const raw = '01073456789012341724060010LOT123\x1D21SER456';
    expect(classifyBarcode(raw)).toBe('gs1-datamatrix');
  });

  it('detects UPC-A (12 digits)', () => {
    expect(classifyBarcode('012345678905')).toBe('upc-a');
  });

  it('detects EAN-13 as upc-a (13 digits)', () => {
    expect(classifyBarcode('0123456789012')).toBe('upc-a');
  });

  it('returns unknown for empty string', () => {
    expect(classifyBarcode('')).toBe('unknown');
  });

  it('returns unknown for random text', () => {
    expect(classifyBarcode('HELLO_WORLD')).toBe('unknown');
  });
});

describe('parseGS1Date', () => {
  it('parses standard YYMMDD', () => {
    const d = parseGS1Date('240615')!;
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(5); // June = 5
    expect(d.getUTCDate()).toBe(15);
  });

  it('handles YY >= 50 as 1900s', () => {
    const d = parseGS1Date('991231')!;
    expect(d.getUTCFullYear()).toBe(1999);
  });

  it('handles DD=00 as last day of month', () => {
    // February 2024 is leap year → 29 days
    const d = parseGS1Date('240200')!;
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(1); // Feb
    expect(d.getUTCDate()).toBe(29);
  });

  it('handles DD=00 for non-leap February', () => {
    const d = parseGS1Date('230200')!;
    expect(d.getUTCDate()).toBe(28);
  });

  it('returns null for invalid month', () => {
    expect(parseGS1Date('241315')).toBeNull();
  });

  it('returns null for non-6-digit input', () => {
    expect(parseGS1Date('12345')).toBeNull();
    expect(parseGS1Date('1234567')).toBeNull();
  });
});

describe('parseGS1', () => {
  it('parses parenthesized format with all AIs', () => {
    const result = parseGS1('(01)07345678901234(17)240600(10)LOT123(21)SER456');
    expect(result.success).toBe(true);
    expect(result.gtin).toBe('07345678901234');
    expect(result.lot).toBe('LOT123');
    expect(result.serial).toBe('SER456');
    expect(result.expiration).toBeDefined();
    expect(result.expiration!.getUTCFullYear()).toBe(2024);
  });

  it('parses FNC1-delimited format', () => {
    const raw = '010734567890123417240600\x1D10LOT123\x1D21SER456';
    const result = parseGS1(raw);
    expect(result.success).toBe(true);
    expect(result.gtin).toBe('07345678901234');
    expect(result.lot).toBe('LOT123');
    expect(result.serial).toBe('SER456');
  });

  it('parses FNC1 format without GS between fixed-length AIs', () => {
    // 01 (14 fixed) followed by 17 (6 fixed) — no GS needed
    const raw = '01073456789012341724060010ABCLOT';
    const result = parseGS1(raw);
    expect(result.success).toBe(true);
    expect(result.gtin).toBe('07345678901234');
    expect(result.lot).toBe('ABCLOT');
  });

  it('strips ]d2 prefix before parsing', () => {
    const result = parseGS1(']d2(01)07345678901234(10)LOT1');
    expect(result.success).toBe(true);
    expect(result.gtin).toBe('07345678901234');
    expect(result.lot).toBe('LOT1');
  });

  it('strips ]C1 prefix before parsing', () => {
    const result = parseGS1(']C1(01)07345678901234(10)LOT1');
    expect(result.success).toBe(true);
    expect(result.classification).toBe('gs1-128');
  });

  it('parses GTIN-only (no lot/serial)', () => {
    const result = parseGS1('(01)07345678901234');
    expect(result.success).toBe(true);
    expect(result.gtin).toBe('07345678901234');
    expect(result.lot).toBeUndefined();
    expect(result.serial).toBeUndefined();
  });

  it('rejects UPC-A barcodes', () => {
    const result = parseGS1('012345678905');
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Not a GS1 barcode');
  });

  it('rejects unknown barcodes', () => {
    const result = parseGS1('HELLO');
    expect(result.success).toBe(false);
  });
});
