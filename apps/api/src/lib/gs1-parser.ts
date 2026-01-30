/**
 * GS1 Barcode Parser
 *
 * Pure functions for classifying and parsing GS1 barcodes.
 * Supports GS1 DataMatrix, GS1-128, UPC-A, and Code 128.
 *
 * Application Identifiers (AIs) parsed:
 *   (01) - GTIN (14 digits, fixed length)
 *   (10) - Lot/Batch (variable, up to 20 chars)
 *   (17) - Expiration date (YYMMDD, 6 digits fixed)
 *   (21) - Serial number (variable, up to 20 chars)
 */

const GS = '\x1D'; // ASCII Group Separator (FNC1 equivalent)

export type BarcodeClassification =
  | 'gs1-datamatrix'
  | 'gs1-128'
  | 'upc-a'
  | 'code128'
  | 'unknown';

export interface GS1ParseResult {
  success: boolean;
  classification: BarcodeClassification;
  rawValue: string;
  gtin?: string;
  lot?: string;
  expiration?: Date;
  serial?: string;
  errors?: string[];
}

/**
 * Classify a barcode string by its format.
 */
export function classifyBarcode(rawValue: string): BarcodeClassification {
  if (!rawValue || rawValue.length === 0) return 'unknown';

  // Symbology identifier prefixes
  if (rawValue.startsWith(']d2')) return 'gs1-datamatrix';
  if (rawValue.startsWith(']C1')) return 'gs1-128';

  // Check for GS character (FNC1 delimiter) — likely GS1
  if (rawValue.includes(GS)) {
    // If starts with 01 + 14 digits, it's GS1
    if (/^01\d{14}/.test(rawValue)) return 'gs1-datamatrix';
    return 'gs1-128';
  }

  // Parenthesized AI format: (01)...
  if (/^\(01\)\d{14}/.test(rawValue)) return 'gs1-datamatrix';

  // Raw FNC1 format starting with AI(01) + 14 digits (no symbology prefix, no GS)
  if (/^01\d{14}/.test(rawValue) && rawValue.length > 16) return 'gs1-datamatrix';

  // Pure 12-digit number → UPC-A
  if (/^\d{12}$/.test(rawValue)) return 'upc-a';

  // Pure 13-digit number → EAN-13 (treat as UPC variant)
  if (/^\d{13}$/.test(rawValue)) return 'upc-a';

  // Pure 14-digit number → GTIN-14 (could be GS1 without AI prefix)
  if (/^\d{14}$/.test(rawValue)) return 'code128';

  return 'unknown';
}

/**
 * Parse a GS1 date string (YYMMDD).
 * YY 00-49 → 2000-2049, YY 50-99 → 1950-1999.
 * DD=00 means last day of month.
 */
export function parseGS1Date(yymmdd: string): Date | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;

  const yy = parseInt(yymmdd.substring(0, 2), 10);
  const mm = parseInt(yymmdd.substring(2, 4), 10);
  const dd = parseInt(yymmdd.substring(4, 6), 10);

  if (mm < 1 || mm > 12) return null;

  const year = yy <= 49 ? 2000 + yy : 1900 + yy;

  if (dd === 0) {
    // Last day of month: create first of next month, subtract 1 day
    const nextMonth = new Date(Date.UTC(year, mm, 1));
    return new Date(nextMonth.getTime() - 86400000);
  }

  const date = new Date(Date.UTC(year, mm - 1, dd));
  // Validate the date is real
  if (date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) return null;

  return date;
}

/**
 * Parse a GS1 barcode string extracting GTIN, lot, expiration, serial.
 */
export function parseGS1(rawValue: string): GS1ParseResult {
  const classification = classifyBarcode(rawValue);
  const base: GS1ParseResult = { success: false, classification, rawValue };

  if (classification === 'upc-a' || classification === 'unknown') {
    return { ...base, errors: ['Not a GS1 barcode'] };
  }

  // Strip symbology prefixes
  let data = rawValue;
  if (data.startsWith(']d2') || data.startsWith(']C1')) {
    data = data.substring(3);
  }

  const errors: string[] = [];
  let gtin: string | undefined;
  let lot: string | undefined;
  let expiration: Date | undefined;
  let serial: string | undefined;

  // Try parenthesized format first: (01)12345678901234(10)LOT...
  const parenRegex = /\((\d{2,4})\)([^(]*)/g;
  const hasParens = /\(\d{2,4}\)/.test(data);

  if (hasParens) {
    let match;
    while ((match = parenRegex.exec(data)) !== null) {
      const ai = match[1];
      const value = match[2];
      switch (ai) {
        case '01':
          if (/^\d{14}$/.test(value)) {
            gtin = value;
          } else {
            errors.push('AI(01) GTIN must be 14 digits');
          }
          break;
        case '10':
          lot = value;
          break;
        case '17':
          if (/^\d{6}$/.test(value)) {
            const parsed = parseGS1Date(value);
            if (parsed) expiration = parsed;
            else errors.push('AI(17) invalid date');
          } else {
            errors.push('AI(17) expiration must be 6 digits');
          }
          break;
        case '21':
          serial = value;
          break;
      }
    }
  } else {
    // FNC1-delimited format: 01<14digits>17<6digits>10<lot>GS21<serial>
    // Fixed-length AIs: 01 (14), 17 (6)
    // Variable-length AIs: 10, 21 — terminated by GS or end of string
    let pos = 0;
    while (pos < data.length) {
      const remaining = data.substring(pos);

      if (remaining.startsWith('01') && remaining.length >= 16) {
        const value = remaining.substring(2, 16);
        if (/^\d{14}$/.test(value)) {
          gtin = value;
          pos += 16;
        } else {
          errors.push('AI(01) GTIN must be 14 digits');
          break;
        }
      } else if (remaining.startsWith('17') && remaining.length >= 8) {
        const value = remaining.substring(2, 8);
        if (/^\d{6}$/.test(value)) {
          const parsed = parseGS1Date(value);
          if (parsed) expiration = parsed;
          else errors.push('AI(17) invalid date');
          pos += 8;
        } else {
          errors.push('AI(17) expiration must be 6 digits');
          break;
        }
      } else if (remaining.startsWith('10')) {
        const gsIdx = remaining.indexOf(GS, 2);
        const value = gsIdx === -1 ? remaining.substring(2) : remaining.substring(2, gsIdx);
        lot = value;
        pos += 2 + value.length + (gsIdx === -1 ? 0 : 1);
      } else if (remaining.startsWith('21')) {
        const gsIdx = remaining.indexOf(GS, 2);
        const value = gsIdx === -1 ? remaining.substring(2) : remaining.substring(2, gsIdx);
        serial = value;
        pos += 2 + value.length + (gsIdx === -1 ? 0 : 1);
      } else if (remaining.startsWith(GS)) {
        pos += 1;
      } else {
        // Unknown AI or data — stop parsing
        break;
      }
    }
  }

  if (!gtin) {
    return { ...base, errors: [...errors, 'No valid GTIN found'] };
  }

  return {
    success: true,
    classification,
    rawValue,
    gtin,
    lot,
    expiration,
    serial,
    errors: errors.length > 0 ? errors : undefined,
  };
}
