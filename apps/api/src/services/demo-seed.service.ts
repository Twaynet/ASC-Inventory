/**
 * Demo Seed Service
 *
 * Generates a deterministic, executive-grade orthopaedic ASC dataset for a
 * single facility. Designed to light up every dashboard panel with realistic
 * data for CEO/CFO/Surgeon/Tech audiences.
 *
 * Rules:
 *   - Operates on exactly one facility_id
 *   - Never touches rows in other facilities
 *   - Never TRUNCATEs or DELETEs
 *   - Fully transactional (caller manages BEGIN/COMMIT/ROLLBACK)
 *   - Idempotent-aware: refuses to run if demo users already exist
 */

import type pg from 'pg';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DemoSeedOptions {
  surgeonCount: number;
  caseCount: number;
  inventoryScale: 'LIGHT' | 'MEDIUM' | 'HEAVY';
  includeFinancialOverrides: boolean;
  includeMissingItems: boolean;
}

export interface DemoSeedResult {
  facilityId: string;
  profile: string;
  summary: {
    usersCreated: number;
    vendorsCreated: number;
    catalogItemsCreated: number;
    inventoryItemsCreated: number;
    inventoryEventsCreated: number;
    preferenceCardsCreated: number;
    casesCreated: number;
    checklistInstancesCreated: number;
    locationsCreated: number;
  };
  accounts: Array<{ username: string; name: string; roles: string[] }>;
}

// ---------------------------------------------------------------------------
// Internal helpers — date arithmetic
// ---------------------------------------------------------------------------

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function isoAgo(days: number): string {
  return daysFromNow(-days).toISOString();
}

// ---------------------------------------------------------------------------
// Static data definitions
// ---------------------------------------------------------------------------

interface UserDef {
  username: string;
  name: string;
  role: string;
  minSurgeonCount?: number; // only create if surgeonCount >= this
}

const STAFF_USERS: UserDef[] = [
  { username: 'demo-admin', name: 'Rebecca Torres', role: 'ADMIN' },
  { username: 'demo-scheduler', name: 'Maria Santos', role: 'SCHEDULER' },
  { username: 'demo-tech', name: 'James Chen', role: 'INVENTORY_TECH' },
  { username: 'demo-circulator', name: 'Angela Williams', role: 'CIRCULATOR' },
  { username: 'demo-scrub', name: 'Tyler Morrison', role: 'SCRUB' },
  { username: 'demo-anesthesia', name: 'David Park', role: 'ANESTHESIA' },
];

const SURGEON_USERS: UserDef[] = [
  { username: 'demo-surgeon-hartfield', name: 'Dr. Michael Hartfield', role: 'SURGEON', minSurgeonCount: 1 },
  { username: 'demo-surgeon-patel', name: 'Dr. Priya Patel', role: 'SURGEON', minSurgeonCount: 2 },
  { username: 'demo-surgeon-knox', name: 'Dr. William Knox', role: 'SURGEON', minSurgeonCount: 3 },
  { username: 'demo-surgeon-lin', name: 'Dr. Sarah Lin', role: 'SURGEON', minSurgeonCount: 4 },
];

interface VendorDef {
  name: string;
  vendorType: string;
  contactEmail: string;
}

const VENDORS: VendorDef[] = [
  { name: 'OrthoMed Systems', vendorType: 'MANUFACTURER', contactEmail: 'sales@orthomed.demo' },
  { name: 'KneeTech Implants', vendorType: 'MANUFACTURER', contactEmail: 'orders@kneetech.demo' },
  { name: 'SpineVision Corp', vendorType: 'LOANER_PROVIDER', contactEmail: 'loaners@spinevision.demo' },
  { name: 'SterileFirst Supply', vendorType: 'DISTRIBUTOR', contactEmail: 'support@sterilefirst.demo' },
  { name: 'OrthoMed Consignment', vendorType: 'CONSIGNMENT', contactEmail: 'consignment@orthomed.demo' },
];

interface CatalogDef {
  name: string;
  category: string;
  manufacturer: string;
  catalogNumber: string;
  criticality: string;
  requiresLot: boolean;
  requiresSerial: boolean;
  requiresExpiration: boolean;
  unitCostCents: number;
  ownershipType: string;
  expirationWarningDays: number | null;
  isLoaner: boolean;
  vendorRef?: string; // vendor name for consignment
}

const CATALOG_ITEMS: CatalogDef[] = [
  // IMPLANTS — CRITICAL, full tracking
  { name: 'Hip Stem - Corail Size 10', category: 'IMPLANT', manufacturer: 'OrthoMed Systems', catalogNumber: 'OM-HS-10', criticality: 'CRITICAL', requiresLot: true, requiresSerial: true, requiresExpiration: true, unitCostCents: 420000, ownershipType: 'OWNED', expirationWarningDays: 90, isLoaner: false },
  { name: 'Hip Stem - Corail Size 12', category: 'IMPLANT', manufacturer: 'OrthoMed Systems', catalogNumber: 'OM-HS-12', criticality: 'CRITICAL', requiresLot: true, requiresSerial: true, requiresExpiration: true, unitCostCents: 420000, ownershipType: 'OWNED', expirationWarningDays: 90, isLoaner: false },
  { name: 'Hip Stem - Corail Size 14', category: 'IMPLANT', manufacturer: 'OrthoMed Systems', catalogNumber: 'OM-HS-14', criticality: 'CRITICAL', requiresLot: true, requiresSerial: true, requiresExpiration: true, unitCostCents: 420000, ownershipType: 'OWNED', expirationWarningDays: 90, isLoaner: false },
  { name: 'Acetabular Cup 52mm', category: 'IMPLANT', manufacturer: 'OrthoMed Systems', catalogNumber: 'OM-AC-52', criticality: 'CRITICAL', requiresLot: true, requiresSerial: true, requiresExpiration: true, unitCostCents: 380000, ownershipType: 'OWNED', expirationWarningDays: 90, isLoaner: false },
  { name: 'Acetabular Cup 54mm', category: 'IMPLANT', manufacturer: 'OrthoMed Systems', catalogNumber: 'OM-AC-54', criticality: 'CRITICAL', requiresLot: true, requiresSerial: true, requiresExpiration: true, unitCostCents: 380000, ownershipType: 'OWNED', expirationWarningDays: 90, isLoaner: false },
  { name: 'Tibial Base Plate - Right', category: 'IMPLANT', manufacturer: 'KneeTech Implants', catalogNumber: 'KT-TBP-R', criticality: 'CRITICAL', requiresLot: true, requiresSerial: true, requiresExpiration: true, unitCostCents: 510000, ownershipType: 'OWNED', expirationWarningDays: 90, isLoaner: false },
  { name: 'Tibial Base Plate - Left', category: 'IMPLANT', manufacturer: 'KneeTech Implants', catalogNumber: 'KT-TBP-L', criticality: 'CRITICAL', requiresLot: true, requiresSerial: true, requiresExpiration: true, unitCostCents: 510000, ownershipType: 'OWNED', expirationWarningDays: 90, isLoaner: false },
  { name: 'Femoral Component - Size 3', category: 'IMPLANT', manufacturer: 'KneeTech Implants', catalogNumber: 'KT-FC-3', criticality: 'CRITICAL', requiresLot: true, requiresSerial: true, requiresExpiration: true, unitCostCents: 480000, ownershipType: 'OWNED', expirationWarningDays: 90, isLoaner: false },

  // INSTRUMENTS — IMPORTANT, mixed tracking
  { name: 'Power Drill System HD', category: 'INSTRUMENT', manufacturer: 'OrthoMed Systems', catalogNumber: 'OM-PDS-HD', criticality: 'IMPORTANT', requiresLot: true, requiresSerial: false, requiresExpiration: true, unitCostCents: 1200000, ownershipType: 'OWNED', expirationWarningDays: 60, isLoaner: false },
  { name: 'Arthroscope 30-degree', category: 'INSTRUMENT', manufacturer: 'SterileFirst Supply', catalogNumber: 'SF-AS-30', criticality: 'IMPORTANT', requiresLot: false, requiresSerial: true, requiresExpiration: false, unitCostCents: 850000, ownershipType: 'OWNED', expirationWarningDays: null, isLoaner: false },
  { name: 'Arthroscope Shaver Blade Set', category: 'INSTRUMENT', manufacturer: 'SterileFirst Supply', catalogNumber: 'SF-ASB-01', criticality: 'ROUTINE', requiresLot: true, requiresSerial: false, requiresExpiration: true, unitCostCents: 35000, ownershipType: 'OWNED', expirationWarningDays: 30, isLoaner: false },
  { name: 'Spine Retractor System', category: 'INSTRUMENT', manufacturer: 'SpineVision Corp', catalogNumber: 'SV-SRS-01', criticality: 'IMPORTANT', requiresLot: false, requiresSerial: true, requiresExpiration: false, unitCostCents: 0, ownershipType: 'LOANER', expirationWarningDays: null, isLoaner: true },
  { name: 'Knee Revision Instrument Tray', category: 'INSTRUMENT', manufacturer: 'KneeTech Implants', catalogNumber: 'KT-KRIT-01', criticality: 'IMPORTANT', requiresLot: true, requiresSerial: false, requiresExpiration: false, unitCostCents: 0, ownershipType: 'LOANER', expirationWarningDays: null, isLoaner: true },
  { name: 'Hip Trial Reduction Set', category: 'INSTRUMENT', manufacturer: 'OrthoMed Systems', catalogNumber: 'OM-HTRS-01', criticality: 'IMPORTANT', requiresLot: false, requiresSerial: true, requiresExpiration: false, unitCostCents: 0, ownershipType: 'CONSIGNED', expirationWarningDays: null, isLoaner: false, vendorRef: 'OrthoMed Consignment' },

  // CONSUMABLES / HIGH_VALUE_SUPPLY
  { name: 'Bone Cement - Simplex P', category: 'HIGH_VALUE_SUPPLY', manufacturer: 'SterileFirst Supply', catalogNumber: 'SF-BC-SP', criticality: 'IMPORTANT', requiresLot: true, requiresSerial: false, requiresExpiration: true, unitCostCents: 18000, ownershipType: 'OWNED', expirationWarningDays: 60, isLoaner: false },
  { name: 'Surgical Mesh 10x15cm', category: 'CONSUMABLE', manufacturer: 'SterileFirst Supply', catalogNumber: 'SF-SM-1015', criticality: 'ROUTINE', requiresLot: true, requiresSerial: false, requiresExpiration: true, unitCostCents: 4500, ownershipType: 'OWNED', expirationWarningDays: 30, isLoaner: false },
  { name: 'Hemostatic Matrix', category: 'HIGH_VALUE_SUPPLY', manufacturer: 'SterileFirst Supply', catalogNumber: 'SF-HM-01', criticality: 'IMPORTANT', requiresLot: true, requiresSerial: false, requiresExpiration: true, unitCostCents: 32000, ownershipType: 'OWNED', expirationWarningDays: 60, isLoaner: false },
  { name: 'Suture Pack - Ortho Standard', category: 'CONSUMABLE', manufacturer: 'SterileFirst Supply', catalogNumber: 'SF-SPO-01', criticality: 'ROUTINE', requiresLot: true, requiresSerial: false, requiresExpiration: false, unitCostCents: 2800, ownershipType: 'OWNED', expirationWarningDays: null, isLoaner: false },
  { name: 'Antibiotic Bone Cement', category: 'HIGH_VALUE_SUPPLY', manufacturer: 'SterileFirst Supply', catalogNumber: 'SF-ABC-01', criticality: 'IMPORTANT', requiresLot: true, requiresSerial: false, requiresExpiration: true, unitCostCents: 24000, ownershipType: 'OWNED', expirationWarningDays: 60, isLoaner: false },
  { name: 'Irrigation Solution 3L', category: 'CONSUMABLE', manufacturer: 'SterileFirst Supply', catalogNumber: 'SF-IS-3L', criticality: 'ROUTINE', requiresLot: true, requiresSerial: false, requiresExpiration: true, unitCostCents: 1500, ownershipType: 'OWNED', expirationWarningDays: 30, isLoaner: false },
  { name: 'Tourniquet Cuff - Large', category: 'CONSUMABLE', manufacturer: 'SterileFirst Supply', catalogNumber: 'SF-TC-LG', criticality: 'ROUTINE', requiresLot: true, requiresSerial: false, requiresExpiration: false, unitCostCents: 900, ownershipType: 'OWNED', expirationWarningDays: null, isLoaner: false },
  { name: 'Wound Closure Kit', category: 'CONSUMABLE', manufacturer: 'SterileFirst Supply', catalogNumber: 'SF-WCK-01', criticality: 'ROUTINE', requiresLot: true, requiresSerial: false, requiresExpiration: true, unitCostCents: 6500, ownershipType: 'OWNED', expirationWarningDays: 30, isLoaner: false },
  { name: 'Pedicle Screw Set 6.5mm', category: 'IMPLANT', manufacturer: 'SpineVision Corp', catalogNumber: 'SV-PS-65', criticality: 'CRITICAL', requiresLot: true, requiresSerial: true, requiresExpiration: true, unitCostCents: 275000, ownershipType: 'OWNED', expirationWarningDays: 90, isLoaner: false },
];

const LOCATIONS = [
  { name: 'Central Sterile Supply', description: 'Main sterile processing department' },
  { name: 'Implant Vault', description: 'Locked implant storage' },
  { name: 'OR Staging', description: 'Pre-operative staging area' },
  { name: 'Loaner Bay', description: 'Vendor loaner tray storage' },
  { name: 'Consignment Closet', description: 'Consignment inventory storage' },
];

// Preference card definitions — reference catalog items by catalogNumber
interface PrefCardDef {
  surgeonIndex: number; // index into created surgeons array
  procedureName: string;
  description: string;
  items: Array<{ catalogNumber: string; quantity: number; notes?: string }>;
}

const PREFERENCE_CARDS: PrefCardDef[] = [
  {
    surgeonIndex: 0, procedureName: 'Total Hip Arthroplasty - Anterior',
    description: 'Anterior approach THA with Corail stem',
    items: [
      { catalogNumber: 'OM-HS-12', quantity: 1, notes: 'Primary size' },
      { catalogNumber: 'OM-AC-54', quantity: 1 },
      { catalogNumber: 'OM-PDS-HD', quantity: 1 },
      { catalogNumber: 'SF-BC-SP', quantity: 1 },
      { catalogNumber: 'SF-SPO-01', quantity: 2 },
    ],
  },
  {
    surgeonIndex: 0, procedureName: 'Lumbar Decompression',
    description: 'Requires SpineVision loaner tray',
    items: [
      { catalogNumber: 'SV-SRS-01', quantity: 1, notes: 'Call vendor 48hrs ahead' },
      { catalogNumber: 'OM-PDS-HD', quantity: 1 },
      { catalogNumber: 'SV-PS-65', quantity: 1 },
    ],
  },
  {
    surgeonIndex: 1, procedureName: 'Total Knee Arthroplasty',
    description: 'Standard TKA with KneeTech components',
    items: [
      { catalogNumber: 'KT-TBP-R', quantity: 1 },
      { catalogNumber: 'KT-FC-3', quantity: 1 },
      { catalogNumber: 'OM-PDS-HD', quantity: 1 },
      { catalogNumber: 'SF-BC-SP', quantity: 1 },
      { catalogNumber: 'SF-TC-LG', quantity: 1 },
    ],
  },
  {
    surgeonIndex: 1, procedureName: 'Knee Arthroscopy',
    description: 'Diagnostic and therapeutic arthroscopy',
    items: [
      { catalogNumber: 'SF-AS-30', quantity: 1 },
      { catalogNumber: 'SF-ASB-01', quantity: 1 },
      { catalogNumber: 'SF-IS-3L', quantity: 2 },
    ],
  },
  {
    surgeonIndex: 2, procedureName: 'Total Hip Arthroplasty - Posterior',
    description: 'Posterior approach THA',
    items: [
      { catalogNumber: 'OM-HS-14', quantity: 1 },
      { catalogNumber: 'OM-AC-52', quantity: 1 },
      { catalogNumber: 'OM-PDS-HD', quantity: 1 },
      { catalogNumber: 'SF-ABC-01', quantity: 1 },
    ],
  },
  {
    surgeonIndex: 3, procedureName: 'Total Knee Arthroplasty - Left',
    description: 'Left-side TKA',
    items: [
      { catalogNumber: 'KT-TBP-L', quantity: 1 },
      { catalogNumber: 'KT-FC-3', quantity: 1 },
      { catalogNumber: 'OM-PDS-HD', quantity: 1 },
      { catalogNumber: 'SF-HM-01', quantity: 1 },
    ],
  },
];

// Case template definitions
interface CaseDef {
  prefCardIndex: number; // index into PREFERENCE_CARDS
  dayOffset: number;     // days from today
  time: string;          // HH:MM
  status: string;
  readiness: 'GREEN' | 'ORANGE' | 'RED' | null; // null for non-SCHEDULED
  laterality: string | null;
  estimatedMinutes: number;
  anesthesiaModality: string;
  orRoomIndex: number;
  cancelledReason?: string;
}

function buildCaseDefinitions(caseCount: number, surgeonCount: number): CaseDef[] {
  const defs: CaseDef[] = [];

  // -- COMPLETED cases (T-7 to T-1) --
  defs.push({ prefCardIndex: 0, dayOffset: -7, time: '07:30', status: 'COMPLETED', readiness: null, laterality: 'RIGHT', estimatedMinutes: 150, anesthesiaModality: 'SPINAL', orRoomIndex: 0 });
  defs.push({ prefCardIndex: 2, dayOffset: -5, time: '08:00', status: 'COMPLETED', readiness: null, laterality: 'RIGHT', estimatedMinutes: 120, anesthesiaModality: 'SPINAL', orRoomIndex: 1 });
  defs.push({ prefCardIndex: 3, dayOffset: -4, time: '10:00', status: 'COMPLETED', readiness: null, laterality: 'RIGHT', estimatedMinutes: 60, anesthesiaModality: 'REGIONAL', orRoomIndex: 0 });
  defs.push({ prefCardIndex: 4, dayOffset: -3, time: '07:30', status: 'COMPLETED', readiness: null, laterality: 'LEFT', estimatedMinutes: 150, anesthesiaModality: 'SPINAL', orRoomIndex: 2 });
  defs.push({ prefCardIndex: 0, dayOffset: -2, time: '08:00', status: 'COMPLETED', readiness: null, laterality: 'RIGHT', estimatedMinutes: 150, anesthesiaModality: 'SPINAL', orRoomIndex: 0 });
  defs.push({ prefCardIndex: 2, dayOffset: -2, time: '10:30', status: 'COMPLETED', readiness: null, laterality: 'RIGHT', estimatedMinutes: 120, anesthesiaModality: 'SPINAL', orRoomIndex: 1 });
  defs.push({ prefCardIndex: 3, dayOffset: -1, time: '07:30', status: 'COMPLETED', readiness: null, laterality: 'RIGHT', estimatedMinutes: 60, anesthesiaModality: 'REGIONAL', orRoomIndex: 0 });
  defs.push({ prefCardIndex: 0, dayOffset: -1, time: '09:00', status: 'COMPLETED', readiness: null, laterality: 'LEFT', estimatedMinutes: 150, anesthesiaModality: 'SPINAL', orRoomIndex: 1 });

  // -- IN_PROGRESS cases (today) --
  defs.push({ prefCardIndex: 2, dayOffset: 0, time: '07:30', status: 'IN_PROGRESS', readiness: null, laterality: 'RIGHT', estimatedMinutes: 120, anesthesiaModality: 'SPINAL', orRoomIndex: 0 });
  defs.push({ prefCardIndex: 4, dayOffset: 0, time: '07:30', status: 'IN_PROGRESS', readiness: null, laterality: 'RIGHT', estimatedMinutes: 150, anesthesiaModality: 'SPINAL', orRoomIndex: 1 });

  // -- SCHEDULED cases (today + future) — readiness mix --
  // Today
  defs.push({ prefCardIndex: 0, dayOffset: 0, time: '11:00', status: 'SCHEDULED', readiness: 'GREEN', laterality: 'RIGHT', estimatedMinutes: 150, anesthesiaModality: 'SPINAL', orRoomIndex: 0 });
  defs.push({ prefCardIndex: 3, dayOffset: 0, time: '11:00', status: 'SCHEDULED', readiness: 'GREEN', laterality: 'RIGHT', estimatedMinutes: 60, anesthesiaModality: 'REGIONAL', orRoomIndex: 2 });

  // Tomorrow (T+1) — readiness showcase day
  defs.push({ prefCardIndex: 0, dayOffset: 1, time: '07:30', status: 'SCHEDULED', readiness: 'GREEN', laterality: 'RIGHT', estimatedMinutes: 150, anesthesiaModality: 'SPINAL', orRoomIndex: 0 });
  defs.push({ prefCardIndex: 2, dayOffset: 1, time: '09:00', status: 'SCHEDULED', readiness: 'GREEN', laterality: 'RIGHT', estimatedMinutes: 120, anesthesiaModality: 'SPINAL', orRoomIndex: 1 });
  defs.push({ prefCardIndex: 1, dayOffset: 1, time: '10:30', status: 'SCHEDULED', readiness: 'RED', laterality: null, estimatedMinutes: 180, anesthesiaModality: 'GENERAL', orRoomIndex: 0 }); // missing loaner
  defs.push({ prefCardIndex: 4, dayOffset: 1, time: '13:00', status: 'SCHEDULED', readiness: 'ORANGE', laterality: 'LEFT', estimatedMinutes: 150, anesthesiaModality: 'SPINAL', orRoomIndex: 2 }); // expiring item

  // T+2
  defs.push({ prefCardIndex: 2, dayOffset: 2, time: '07:30', status: 'SCHEDULED', readiness: 'GREEN', laterality: 'RIGHT', estimatedMinutes: 120, anesthesiaModality: 'SPINAL', orRoomIndex: 0 });
  defs.push({ prefCardIndex: 0, dayOffset: 2, time: '09:00', status: 'SCHEDULED', readiness: 'ORANGE', laterality: 'RIGHT', estimatedMinutes: 150, anesthesiaModality: 'SPINAL', orRoomIndex: 1 });
  defs.push({ prefCardIndex: 3, dayOffset: 2, time: '11:00', status: 'SCHEDULED', readiness: 'GREEN', laterality: 'LEFT', estimatedMinutes: 60, anesthesiaModality: 'REGIONAL', orRoomIndex: 2 });

  // T+3
  defs.push({ prefCardIndex: 4, dayOffset: 3, time: '07:30', status: 'SCHEDULED', readiness: 'RED', laterality: 'RIGHT', estimatedMinutes: 150, anesthesiaModality: 'SPINAL', orRoomIndex: 0 }); // missing implant
  defs.push({ prefCardIndex: 2, dayOffset: 3, time: '09:00', status: 'SCHEDULED', readiness: 'GREEN', laterality: 'RIGHT', estimatedMinutes: 120, anesthesiaModality: 'SPINAL', orRoomIndex: 1 });

  // T+5
  defs.push({ prefCardIndex: 0, dayOffset: 5, time: '07:30', status: 'SCHEDULED', readiness: 'ORANGE', laterality: 'LEFT', estimatedMinutes: 150, anesthesiaModality: 'SPINAL', orRoomIndex: 0 });
  defs.push({ prefCardIndex: 3, dayOffset: 5, time: '09:00', status: 'SCHEDULED', readiness: 'GREEN', laterality: 'RIGHT', estimatedMinutes: 60, anesthesiaModality: 'MAC', orRoomIndex: 1 });

  // T+7
  defs.push({ prefCardIndex: 2, dayOffset: 7, time: '07:30', status: 'SCHEDULED', readiness: 'GREEN', laterality: 'RIGHT', estimatedMinutes: 120, anesthesiaModality: 'SPINAL', orRoomIndex: 0 });

  // -- REQUESTED cases (future, not activated) --
  defs.push({ prefCardIndex: 0, dayOffset: 8, time: '08:00', status: 'REQUESTED', readiness: null, laterality: 'RIGHT', estimatedMinutes: 150, anesthesiaModality: 'SPINAL', orRoomIndex: 0 });
  defs.push({ prefCardIndex: 2, dayOffset: 9, time: '08:00', status: 'REQUESTED', readiness: null, laterality: 'LEFT', estimatedMinutes: 120, anesthesiaModality: 'SPINAL', orRoomIndex: 1 });
  defs.push({ prefCardIndex: 4, dayOffset: 10, time: '08:00', status: 'REQUESTED', readiness: null, laterality: 'RIGHT', estimatedMinutes: 150, anesthesiaModality: 'SPINAL', orRoomIndex: 2 });
  defs.push({ prefCardIndex: 3, dayOffset: 10, time: '10:00', status: 'REQUESTED', readiness: null, laterality: 'RIGHT', estimatedMinutes: 60, anesthesiaModality: 'REGIONAL', orRoomIndex: 0 });
  defs.push({ prefCardIndex: 0, dayOffset: 11, time: '08:00', status: 'REQUESTED', readiness: null, laterality: 'LEFT', estimatedMinutes: 150, anesthesiaModality: 'SPINAL', orRoomIndex: 1 });
  defs.push({ prefCardIndex: 1, dayOffset: 12, time: '08:00', status: 'REQUESTED', readiness: null, laterality: null, estimatedMinutes: 180, anesthesiaModality: 'GENERAL', orRoomIndex: 0 });
  defs.push({ prefCardIndex: 2, dayOffset: 13, time: '08:00', status: 'REQUESTED', readiness: null, laterality: 'RIGHT', estimatedMinutes: 120, anesthesiaModality: 'SPINAL', orRoomIndex: 2 });
  defs.push({ prefCardIndex: 4, dayOffset: 14, time: '08:00', status: 'REQUESTED', readiness: null, laterality: 'LEFT', estimatedMinutes: 150, anesthesiaModality: 'SPINAL', orRoomIndex: 0 });

  // -- CANCELLED cases --
  defs.push({ prefCardIndex: 0, dayOffset: -3, time: '14:00', status: 'CANCELLED', readiness: null, laterality: 'RIGHT', estimatedMinutes: 150, anesthesiaModality: 'SPINAL', orRoomIndex: 2, cancelledReason: 'Patient request — rescheduling' });
  defs.push({ prefCardIndex: 2, dayOffset: 1, time: '15:00', status: 'CANCELLED', readiness: null, laterality: 'RIGHT', estimatedMinutes: 120, anesthesiaModality: 'SPINAL', orRoomIndex: 1, cancelledReason: 'Insurance authorization pending' });
  defs.push({ prefCardIndex: 3, dayOffset: 3, time: '14:00', status: 'CANCELLED', readiness: null, laterality: 'LEFT', estimatedMinutes: 60, anesthesiaModality: 'REGIONAL', orRoomIndex: 2, cancelledReason: 'Surgeon scheduling conflict' });
  defs.push({ prefCardIndex: 4, dayOffset: 5, time: '13:00', status: 'CANCELLED', readiness: null, laterality: 'RIGHT', estimatedMinutes: 150, anesthesiaModality: 'SPINAL', orRoomIndex: 0, cancelledReason: 'Patient medical clearance not obtained' });

  // Filter by surgeonCount — drop preference cards for surgeons that don't exist
  const maxSurgeonIndex = surgeonCount - 1;
  const filtered = defs.filter(d => {
    const card = PREFERENCE_CARDS[d.prefCardIndex];
    return card && card.surgeonIndex <= maxSurgeonIndex;
  });

  // Trim to requested caseCount
  return filtered.slice(0, caseCount);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function executeDemoSeed(
  client: pg.PoolClient,
  facilityId: string,
  options: DemoSeedOptions,
): Promise<DemoSeedResult> {
  // -----------------------------------------------------------------------
  // 1. Idempotency check
  // -----------------------------------------------------------------------
  const existingDemo = await client.query(
    `SELECT 1 FROM app_user WHERE facility_id = $1 AND username LIKE 'demo-%' LIMIT 1`,
    [facilityId],
  );
  if (existingDemo.rows.length > 0) {
    throw new Error('Demo seed already applied to this facility');
  }

  // Verify facility exists
  const facilityCheck = await client.query(
    'SELECT id, name FROM facility WHERE id = $1',
    [facilityId],
  );
  if (facilityCheck.rows.length === 0) {
    throw new Error(`Facility ${facilityId} not found`);
  }

  // -----------------------------------------------------------------------
  // 2. Lookup existing ASC organization (from bootstrap)
  // -----------------------------------------------------------------------
  const ascOrgResult = await client.query(
    `SELECT id FROM organization WHERE facility_id = $1 AND organization_type = 'ASC' AND is_active = true LIMIT 1`,
    [facilityId],
  );
  if (ascOrgResult.rows.length === 0) {
    throw new Error('Facility has no ASC organization — run bootstrap first');
  }
  const ascOrgId: string = ascOrgResult.rows[0].id;

  // -----------------------------------------------------------------------
  // 3. Create SURGEON_GROUP organization
  // -----------------------------------------------------------------------
  const surgGroupResult = await client.query(
    `INSERT INTO organization (facility_id, name, organization_type)
     VALUES ($1, 'Hartfield & Patel Orthopaedics', 'SURGEON_GROUP')
     RETURNING id`,
    [facilityId],
  );
  const surgGroupId: string = surgGroupResult.rows[0].id;

  // -----------------------------------------------------------------------
  // 4. Create users
  // -----------------------------------------------------------------------
  const passwordHash = await bcrypt.hash('Demo2024!', 10);
  const accounts: DemoSeedResult['accounts'] = [];
  const userIds: Record<string, string> = {};

  // Staff users
  for (const u of STAFF_USERS) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO app_user (facility_id, username, email, name, role, roles, password_hash)
       VALUES ($1, $2, $3, $4, $5, ARRAY[$5::user_role], $6)
       RETURNING id`,
      [facilityId, u.username, `${u.username}@demo.orthowise.dev`, u.name, u.role, passwordHash],
    );
    userIds[u.username] = result.rows[0].id;
    accounts.push({ username: u.username, name: u.name, roles: [u.role] });
  }

  // Surgeon users (filtered by surgeonCount)
  const surgeonIds: string[] = [];
  for (const u of SURGEON_USERS) {
    if (u.minSurgeonCount && u.minSurgeonCount > options.surgeonCount) continue;
    const result = await client.query<{ id: string }>(
      `INSERT INTO app_user (facility_id, username, email, name, role, roles, password_hash)
       VALUES ($1, $2, $3, $4, $5, ARRAY[$5::user_role], $6)
       RETURNING id`,
      [facilityId, u.username, `${u.username}@demo.orthowise.dev`, u.name, u.role, passwordHash],
    );
    userIds[u.username] = result.rows[0].id;
    surgeonIds.push(result.rows[0].id);
    accounts.push({ username: u.username, name: u.name, roles: [u.role] });
  }

  const adminId = userIds['demo-admin'];
  const techId = userIds['demo-tech'];
  const circulatorId = userIds['demo-circulator'];

  // -----------------------------------------------------------------------
  // 5. Affiliate users with organizations
  // -----------------------------------------------------------------------
  // All users → ASC PRIMARY
  for (const uid of Object.values(userIds)) {
    await client.query(
      `INSERT INTO user_organization_affiliation (user_id, organization_id, affiliation_type, granted_by_user_id)
       VALUES ($1, $2, 'PRIMARY', $3)`,
      [uid, ascOrgId, adminId],
    );
  }
  // First two surgeons → SURGEON_GROUP SECONDARY
  if (surgeonIds.length >= 2) {
    for (const sid of surgeonIds.slice(0, 2)) {
      await client.query(
        `INSERT INTO user_organization_affiliation (user_id, organization_id, affiliation_type, granted_by_user_id)
         VALUES ($1, $2, 'SECONDARY', $3)`,
        [sid, surgGroupId, adminId],
      );
    }
  }

  // -----------------------------------------------------------------------
  // 6. Create locations
  // -----------------------------------------------------------------------
  const locationIds: Record<string, string> = {};
  for (const loc of LOCATIONS) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO location (facility_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [facilityId, loc.name, loc.description],
    );
    locationIds[loc.name] = result.rows[0].id;
  }

  // -----------------------------------------------------------------------
  // 7. Lookup existing rooms (from bootstrap)
  // -----------------------------------------------------------------------
  const roomResult = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM room WHERE facility_id = $1 AND active = true ORDER BY sort_order`,
    [facilityId],
  );
  const roomIds = roomResult.rows.map(r => r.id);
  if (roomIds.length === 0) {
    throw new Error('Facility has no rooms — run bootstrap first');
  }

  // -----------------------------------------------------------------------
  // 8. Create vendors
  // -----------------------------------------------------------------------
  const vendorIds: Record<string, string> = {};
  for (const v of VENDORS) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO vendor (facility_id, name, vendor_type, contact_email)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [facilityId, v.name, v.vendorType, v.contactEmail],
    );
    vendorIds[v.name] = result.rows[0].id;
  }

  // -----------------------------------------------------------------------
  // 9. Create catalog items
  // -----------------------------------------------------------------------
  const catalogIds: Record<string, string> = {};
  for (const c of CATALOG_ITEMS) {
    const consignmentVendorId = c.vendorRef ? vendorIds[c.vendorRef] : null;
    const result = await client.query<{ id: string }>(
      `INSERT INTO item_catalog (
         facility_id, name, description, category, manufacturer, catalog_number,
         criticality, requires_lot_tracking, requires_serial_tracking, requires_expiration_tracking,
         readiness_required, expiration_warning_days,
         unit_cost_cents, unit_cost_effective_at, ownership_type,
         consignment_vendor_id, is_billable, is_loaner, requires_sterility
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,true)
       RETURNING id`,
      [
        facilityId, c.name, `Demo: ${c.name}`, c.category, c.manufacturer, c.catalogNumber,
        c.criticality, c.requiresLot, c.requiresSerial, c.requiresExpiration,
        true, c.expirationWarningDays,
        c.unitCostCents, new Date().toISOString(), c.ownershipType,
        consignmentVendorId, c.unitCostCents > 0, c.isLoaner,
      ],
    );
    catalogIds[c.catalogNumber] = result.rows[0].id;
  }

  // -----------------------------------------------------------------------
  // 10. Create inventory items + events
  // -----------------------------------------------------------------------
  const scaleMultiplier = options.inventoryScale === 'LIGHT' ? 0.5 : options.inventoryScale === 'HEAVY' ? 2 : 1;
  let inventoryItemCount = 0;
  let inventoryEventCount = 0;

  // Helper to create an inventory item + RECEIVED event
  async function createInventoryItem(params: {
    catalogNumber: string;
    locationName: string;
    seq: number;
    availabilityStatus: string;
    sterilityStatus: string;
    sterilityExpiresAt: Date | null;
    lotNumber: string | null;
    serialNumber: string | null;
    reservedForCaseId?: string | null;
  }): Promise<string> {
    const catId = catalogIds[params.catalogNumber];
    const locId = locationIds[params.locationName];
    const barcode = `DEMO-${params.catalogNumber}-${String(params.seq).padStart(3, '0')}`;

    const result = await client.query<{ id: string }>(
      `INSERT INTO inventory_item (
         facility_id, catalog_id, barcode, serial_number, lot_number,
         location_id, sterility_status, sterility_expires_at,
         availability_status, reserved_for_case_id,
         last_verified_at, last_verified_by_user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        facilityId, catId, barcode,
        params.serialNumber, params.lotNumber,
        locId, params.sterilityStatus, params.sterilityExpiresAt?.toISOString() ?? null,
        params.availabilityStatus, params.reservedForCaseId ?? null,
        params.availabilityStatus !== 'MISSING' ? isoAgo(7) : null,
        params.availabilityStatus !== 'MISSING' ? techId : null,
      ],
    );
    const itemId = result.rows[0].id;
    inventoryItemCount++;

    // RECEIVED event
    await client.query(
      `INSERT INTO inventory_event (
         facility_id, inventory_item_id, event_type, location_id,
         sterility_status, notes, performed_by_user_id, occurred_at
       ) VALUES ($1,$2,'RECEIVED',$3,$4,$5,$6,$7)`,
      [facilityId, itemId, locId, params.sterilityStatus, 'Demo seed intake', techId, isoAgo(60)],
    );
    inventoryEventCount++;

    // VERIFIED event (for non-MISSING items)
    if (params.availabilityStatus !== 'MISSING') {
      await client.query(
        `INSERT INTO inventory_event (
           facility_id, inventory_item_id, event_type, location_id,
           notes, performed_by_user_id, occurred_at
         ) VALUES ($1,$2,'VERIFIED',$3,$4,$5,$6)`,
        [facilityId, itemId, locId, 'Cycle count verification', techId, isoAgo(7)],
      );
      inventoryEventCount++;
    }

    return itemId;
  }

  // Helper to create ADJUSTED(MISSING) event
  async function markMissing(itemId: string, daysAgo: number, locationName: string, staffId: string): Promise<void> {
    await client.query(
      `INSERT INTO inventory_event (
         facility_id, inventory_item_id, event_type, location_id,
         notes, performed_by_user_id, occurred_at
       ) VALUES ($1,$2,'ADJUSTED',$3,$4,$5,$6)`,
      [facilityId, itemId, locationIds[locationName], `[MISSING] Reported not found during cycle count`, staffId, isoAgo(daysAgo)],
    );
    inventoryEventCount++;
  }

  // Normal stock — iterate catalog items, create multiple per item
  const normalExpiry = daysFromNow(30);
  let globalSeq = 0;

  for (const c of CATALOG_ITEMS) {
    // Skip loaner/consignment items from bulk stock creation
    if (c.ownershipType === 'LOANER' || c.ownershipType === 'CONSIGNED') continue;

    const baseQty = c.category === 'IMPLANT' ? 3 : c.category === 'INSTRUMENT' ? 2 : 4;
    const qty = Math.max(1, Math.round(baseQty * scaleMultiplier));
    const locationName = c.category === 'IMPLANT' ? 'Implant Vault' : 'Central Sterile Supply';

    for (let i = 0; i < qty; i++) {
      globalSeq++;
      await createInventoryItem({
        catalogNumber: c.catalogNumber,
        locationName,
        seq: globalSeq,
        availabilityStatus: 'AVAILABLE',
        sterilityStatus: c.requiresExpiration ? 'STERILE' : 'NON_STERILE',
        sterilityExpiresAt: c.requiresExpiration ? normalExpiry : null,
        lotNumber: c.requiresLot ? `LOT-2026Q1-${String(globalSeq).padStart(4, '0')}` : null,
        serialNumber: c.requiresSerial ? `SN-${c.catalogNumber}-${String(globalSeq).padStart(4, '0')}` : null,
      });
    }
  }

  // Risk queue: EXPIRING_SOON items (3 items expiring in 4 days)
  for (const catNum of ['OM-HS-10', 'OM-AC-52', 'SF-BC-SP']) {
    globalSeq++;
    await createInventoryItem({
      catalogNumber: catNum,
      locationName: 'Implant Vault',
      seq: globalSeq,
      availabilityStatus: 'AVAILABLE',
      sterilityStatus: 'STERILE',
      sterilityExpiresAt: daysFromNow(4),
      lotNumber: `LOT-EXPIRING-${String(globalSeq).padStart(4, '0')}`,
      serialNumber: `SN-EXPIRING-${String(globalSeq).padStart(4, '0')}`,
    });
  }

  // Risk queue: EXPIRED items (2 items expired 3 days ago)
  for (const catNum of ['KT-TBP-R', 'SF-HM-01']) {
    globalSeq++;
    await createInventoryItem({
      catalogNumber: catNum,
      locationName: 'Implant Vault',
      seq: globalSeq,
      availabilityStatus: 'AVAILABLE',
      sterilityStatus: 'EXPIRED',
      sterilityExpiresAt: daysFromNow(-3),
      lotNumber: `LOT-EXPIRED-${String(globalSeq).padStart(4, '0')}`,
      serialNumber: catNum === 'KT-TBP-R' ? `SN-EXPIRED-${String(globalSeq).padStart(4, '0')}` : null,
    });
  }

  // Risk queue: MISSING_LOT items (3 items with lot_number = NULL where required)
  for (const catNum of ['OM-HS-12', 'KT-FC-3', 'SF-ABC-01']) {
    globalSeq++;
    const cat = CATALOG_ITEMS.find(c => c.catalogNumber === catNum)!;
    await createInventoryItem({
      catalogNumber: catNum,
      locationName: 'Central Sterile Supply',
      seq: globalSeq,
      availabilityStatus: 'AVAILABLE',
      sterilityStatus: 'STERILE',
      sterilityExpiresAt: normalExpiry,
      lotNumber: null, // intentionally null to trigger MISSING_LOT
      serialNumber: cat.requiresSerial ? `SN-NOLOT-${String(globalSeq).padStart(4, '0')}` : null,
    });
  }

  // Risk queue: MISSING_SERIAL items (2 items with serial_number = NULL where required)
  for (const catNum of ['OM-AC-54', 'SV-PS-65']) {
    globalSeq++;
    await createInventoryItem({
      catalogNumber: catNum,
      locationName: 'Implant Vault',
      seq: globalSeq,
      availabilityStatus: 'AVAILABLE',
      sterilityStatus: 'STERILE',
      sterilityExpiresAt: normalExpiry,
      lotNumber: `LOT-NOSER-${String(globalSeq).padStart(4, '0')}`,
      serialNumber: null, // intentionally null to trigger MISSING_SERIAL
    });
  }

  // Missing analytics: MISSING items (3 items)
  if (options.includeMissingItems) {
    const missingDefs = [
      { catNum: 'OM-HS-14', loc: 'Implant Vault', daysAgo: 3, staff: techId },
      { catNum: 'SF-SM-1015', loc: 'Central Sterile Supply', daysAgo: 8, staff: circulatorId },
      { catNum: 'SF-WCK-01', loc: 'OR Staging', daysAgo: 15, staff: techId },
    ];
    for (const m of missingDefs) {
      globalSeq++;
      const cat = CATALOG_ITEMS.find(c => c.catalogNumber === m.catNum)!;
      const itemId = await createInventoryItem({
        catalogNumber: m.catNum,
        locationName: m.loc,
        seq: globalSeq,
        availabilityStatus: 'MISSING',
        sterilityStatus: 'STERILE',
        sterilityExpiresAt: cat.requiresExpiration ? normalExpiry : null,
        lotNumber: cat.requiresLot ? `LOT-MISSING-${String(globalSeq).padStart(4, '0')}` : null,
        serialNumber: cat.requiresSerial ? `SN-MISSING-${String(globalSeq).padStart(4, '0')}` : null,
      });
      await markMissing(itemId, m.daysAgo, m.loc, m.staff);
    }
  }

  // Financial attribution events
  if (options.includeFinancialOverrides) {
    // Pick a few normal inventory items to attach financial events to
    // Use the first 3 implant catalog IDs for cost snapshots
    const implantCatNums = ['OM-HS-12', 'OM-AC-54', 'KT-TBP-R'];
    for (const catNum of implantCatNums) {
      const catId = catalogIds[catNum];
      const cat = CATALOG_ITEMS.find(c => c.catalogNumber === catNum)!;
      // Find an inventory item for this catalog
      const itemResult = await client.query<{ id: string }>(
        `SELECT id FROM inventory_item WHERE facility_id = $1 AND catalog_id = $2 AND availability_status = 'AVAILABLE' LIMIT 1`,
        [facilityId, catId],
      );
      if (itemResult.rows.length > 0) {
        await client.query(
          `INSERT INTO inventory_event (
             facility_id, inventory_item_id, event_type, notes,
             performed_by_user_id, occurred_at, cost_snapshot_cents
           ) VALUES ($1,$2,'VERIFIED',$3,$4,$5,$6)`,
          [facilityId, itemResult.rows[0].id, 'Financial attestation — cost recorded', adminId, isoAgo(5), cat.unitCostCents],
        );
        inventoryEventCount++;
      }
    }

    // 2 NEGOTIATED_DISCOUNT overrides
    for (const catNum of ['KT-FC-3', 'OM-HS-10']) {
      const catId = catalogIds[catNum];
      const cat = CATALOG_ITEMS.find(c => c.catalogNumber === catNum)!;
      const itemResult = await client.query<{ id: string }>(
        `SELECT id FROM inventory_item WHERE facility_id = $1 AND catalog_id = $2 AND availability_status = 'AVAILABLE' LIMIT 1`,
        [facilityId, catId],
      );
      if (itemResult.rows.length > 0) {
        const discountCents = Math.round(cat.unitCostCents * 0.85);
        await client.query(
          `INSERT INTO inventory_event (
             facility_id, inventory_item_id, event_type, notes,
             performed_by_user_id, occurred_at,
             cost_snapshot_cents, cost_override_cents, cost_override_reason, cost_override_note,
             financial_attestation_user_id
           ) VALUES ($1,$2,'VERIFIED',$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            facilityId, itemResult.rows[0].id, 'Vendor volume discount applied', adminId, isoAgo(4),
            cat.unitCostCents, discountCents, 'NEGOTIATED_DISCOUNT', 'Q4 volume discount agreement',
            adminId,
          ],
        );
        inventoryEventCount++;
      }
    }

    // 1 GRATIS (vendor sample)
    {
      const catId = catalogIds['SF-HM-01'];
      const itemResult = await client.query<{ id: string }>(
        `SELECT id FROM inventory_item WHERE facility_id = $1 AND catalog_id = $2 AND availability_status = 'AVAILABLE' LIMIT 1`,
        [facilityId, catId],
      );
      if (itemResult.rows.length > 0) {
        await client.query(
          `INSERT INTO inventory_event (
             facility_id, inventory_item_id, event_type, notes,
             performed_by_user_id, occurred_at,
             cost_snapshot_cents, is_gratis, gratis_reason,
             provided_by_vendor_id, provided_by_rep_name,
             financial_attestation_user_id
           ) VALUES ($1,$2,'RECEIVED',$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            facilityId, itemResult.rows[0].id, 'Vendor sample — gratis', adminId, isoAgo(14),
            0, true, 'VENDOR_SAMPLE',
            vendorIds['SterileFirst Supply'], 'Dave Mitchell',
            adminId,
          ],
        );
        inventoryEventCount++;
      }
    }

    // 1 VENDOR_CONCESSION
    {
      const catId = catalogIds['SF-BC-SP'];
      const cat = CATALOG_ITEMS.find(c => c.catalogNumber === 'SF-BC-SP')!;
      const itemResult = await client.query<{ id: string }>(
        `SELECT id FROM inventory_item WHERE facility_id = $1 AND catalog_id = $2 AND availability_status = 'AVAILABLE' LIMIT 1`,
        [facilityId, catId],
      );
      if (itemResult.rows.length > 0) {
        await client.query(
          `INSERT INTO inventory_event (
             facility_id, inventory_item_id, event_type, notes,
             performed_by_user_id, occurred_at,
             cost_snapshot_cents, cost_override_cents, cost_override_reason, cost_override_note,
             provided_by_vendor_id,
             financial_attestation_user_id
           ) VALUES ($1,$2,'VERIFIED',$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            facilityId, itemResult.rows[0].id, 'Vendor concession — damaged packaging credit', adminId, isoAgo(10),
            cat.unitCostCents, 0, 'VENDOR_CONCESSION', 'Damaged packaging — full credit issued',
            vendorIds['SterileFirst Supply'],
            adminId,
          ],
        );
        inventoryEventCount++;
      }
    }
  }

  // -----------------------------------------------------------------------
  // 12. Create preference cards + versions
  // -----------------------------------------------------------------------
  interface PrefCardResult {
    cardId: string;
    versionId: string;
    surgeonId: string;
    procedureName: string;
    itemCatalogNumbers: string[];
  }
  const prefCards: PrefCardResult[] = [];

  for (const pc of PREFERENCE_CARDS) {
    if (pc.surgeonIndex >= surgeonIds.length) continue;
    const surgeonId = surgeonIds[pc.surgeonIndex];

    const cardResult = await client.query<{ id: string }>(
      `INSERT INTO preference_card (facility_id, surgeon_id, procedure_name, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [facilityId, surgeonId, pc.procedureName, pc.description],
    );
    const cardId = cardResult.rows[0].id;

    const items = pc.items.map(item => ({
      catalogId: catalogIds[item.catalogNumber],
      quantity: item.quantity,
      notes: item.notes,
    }));

    const versionResult = await client.query<{ id: string }>(
      `INSERT INTO preference_card_version (preference_card_id, version_number, items, created_by_user_id)
       VALUES ($1, 1, $2, $3)
       RETURNING id`,
      [cardId, JSON.stringify(items), surgeonId],
    );
    const versionId = versionResult.rows[0].id;

    await client.query(
      `UPDATE preference_card SET current_version_id = $1 WHERE id = $2`,
      [versionId, cardId],
    );

    prefCards.push({
      cardId,
      versionId,
      surgeonId,
      procedureName: pc.procedureName,
      itemCatalogNumbers: pc.items.map(i => i.catalogNumber),
    });
  }

  // -----------------------------------------------------------------------
  // 14. Create surgical cases
  // -----------------------------------------------------------------------
  const caseDefs = buildCaseDefinitions(options.caseCount, options.surgeonCount);
  let casesCreated = 0;

  interface CreatedCase {
    caseId: string;
    def: CaseDef;
    prefCard: PrefCardResult;
  }
  const createdCases: CreatedCase[] = [];

  for (const caseDef of caseDefs) {
    const prefCard = prefCards[caseDef.prefCardIndex];
    if (!prefCard) continue;

    const isActivated = caseDef.status !== 'REQUESTED';
    const isCancelled = caseDef.status === 'CANCELLED';
    const scheduledDate = dateStr(daysFromNow(caseDef.dayOffset));

    const caseResult = await client.query<{ id: string }>(
      `INSERT INTO surgical_case (
         facility_id, case_number, scheduled_date, scheduled_time,
         surgeon_id, procedure_name, preference_card_version_id,
         status, is_active, is_cancelled,
         activated_at, activated_by_user_id,
         estimated_duration_minutes, laterality, or_room,
         primary_organization_id
       ) VALUES (
         $1, generate_case_number($1), $2, $3,
         $4, $5, $6,
         $7, $8, $9,
         $10, $11,
         $12, $13, $14,
         $15
       )
       RETURNING id`,
      [
        facilityId, scheduledDate, caseDef.time,
        prefCard.surgeonId, prefCard.procedureName, prefCard.versionId,
        caseDef.status, isActivated, isCancelled,
        isActivated ? new Date().toISOString() : null, isActivated ? adminId : null,
        caseDef.estimatedMinutes, caseDef.laterality,
        roomIds[caseDef.orRoomIndex % roomIds.length],
        ascOrgId,
      ],
    );
    const caseId = caseResult.rows[0].id;
    casesCreated++;
    createdCases.push({ caseId, def: caseDef, prefCard });

    // -----------------------------------------------------------------------
    // 15. Case requirements (from preference card items)
    // -----------------------------------------------------------------------
    for (const catNum of prefCard.itemCatalogNumbers) {
      await client.query(
        `INSERT INTO case_requirement (case_id, catalog_id, quantity, is_surgeon_override)
         VALUES ($1, $2, 1, false)`,
        [caseId, catalogIds[catNum]],
      );
    }

    // -----------------------------------------------------------------------
    // 16. Status events (append-only audit trail)
    // -----------------------------------------------------------------------
    const statusChain = buildStatusChain(caseDef.status, caseDef.cancelledReason);
    for (const evt of statusChain) {
      await client.query(
        `INSERT INTO surgical_case_status_event (surgical_case_id, from_status, to_status, reason, context, actor_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [caseId, evt.from, evt.to, evt.reason, JSON.stringify({ source: 'demo_seed' }), adminId],
      );
    }

    // -----------------------------------------------------------------------
    // 17. Case event log
    // -----------------------------------------------------------------------
    await client.query(
      `INSERT INTO case_event_log (case_id, facility_id, event_type, user_id, user_role, user_name, description)
       VALUES ($1, $2, 'CASE_CREATED', $3, 'ADMIN', 'Rebecca Torres', $4)`,
      [caseId, facilityId, adminId, `Case created for ${prefCard.procedureName}`],
    );

    // -----------------------------------------------------------------------
    // 18. Anesthesia plan
    // -----------------------------------------------------------------------
    await client.query(
      `INSERT INTO case_anesthesia_plan (case_id, facility_id, modality)
       VALUES ($1, $2, $3)`,
      [caseId, facilityId, caseDef.anesthesiaModality],
    );
  }

  // -----------------------------------------------------------------------
  // 19. Readiness cache for SCHEDULED cases
  // -----------------------------------------------------------------------
  const scheduledCases = createdCases.filter(c => c.def.status === 'SCHEDULED');
  for (const sc of scheduledCases) {
    const surgeonUser = accounts.find(a => a.roles.includes('SURGEON') &&
      prefCards.some(pc => pc.surgeonId === userIds[a.username] && pc.versionId === sc.prefCard.versionId));
    const surgeonName = surgeonUser?.name ?? 'Unknown Surgeon';

    const totalRequired = sc.prefCard.itemCatalogNumbers.length;
    const readinessState = sc.def.readiness ?? 'RED';
    let totalVerified = totalRequired;
    let missingItems: Array<{ catalogId: string; catalogName: string; quantity: number }> = [];

    if (readinessState === 'RED') {
      // One item missing
      const missingCatNum = sc.prefCard.itemCatalogNumbers[0];
      const missingCat = CATALOG_ITEMS.find(c => c.catalogNumber === missingCatNum);
      missingItems = [{ catalogId: catalogIds[missingCatNum], catalogName: missingCat?.name ?? missingCatNum, quantity: 1 }];
      totalVerified = totalRequired - 1;
    } else if (readinessState === 'ORANGE') {
      totalVerified = totalRequired - 1;
    }

    await client.query(
      `INSERT INTO case_readiness_cache (
         case_id, facility_id, scheduled_date, procedure_name, surgeon_name,
         readiness_state, missing_items, total_required_items, total_verified_items,
         has_attestation, computed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
      [
        sc.caseId, facilityId, dateStr(daysFromNow(sc.def.dayOffset)),
        sc.prefCard.procedureName, surgeonName,
        readinessState, JSON.stringify(missingItems), totalRequired, totalVerified,
        false,
      ],
    );
  }

  // -----------------------------------------------------------------------
  // 20. Attestations for GREEN cases (2 of them)
  // -----------------------------------------------------------------------
  const greenCases = scheduledCases.filter(c => c.def.readiness === 'GREEN').slice(0, 2);
  for (const gc of greenCases) {
    // Case readiness attestation
    await client.query(
      `INSERT INTO attestation (facility_id, case_id, type, attested_by_user_id, readiness_state_at_time, notes)
       VALUES ($1, $2, 'CASE_READINESS', $3, 'GREEN', 'All items verified and available')`,
      [facilityId, gc.caseId, circulatorId],
    );
    // Surgeon acknowledgment
    await client.query(
      `INSERT INTO attestation (facility_id, case_id, type, attested_by_user_id, readiness_state_at_time, notes)
       VALUES ($1, $2, 'SURGEON_ACKNOWLEDGMENT', $3, 'GREEN', 'Reviewed and acknowledged')`,
      [facilityId, gc.caseId, gc.prefCard.surgeonId],
    );
    // Update readiness cache with attestation info
    await client.query(
      `UPDATE case_readiness_cache SET has_attestation = true, attested_at = NOW(),
         attested_by_name = 'Angela Williams', has_surgeon_acknowledgment = true, surgeon_acknowledged_at = NOW()
       WHERE case_id = $1`,
      [gc.caseId],
    );
  }

  // -----------------------------------------------------------------------
  // 21. Facility settings — enable checklists
  // -----------------------------------------------------------------------
  await client.query(
    `INSERT INTO facility_settings (facility_id, enable_timeout_debrief)
     VALUES ($1, true)
     ON CONFLICT (facility_id)
     DO UPDATE SET enable_timeout_debrief = true, updated_at = NOW()`,
    [facilityId],
  );

  // -----------------------------------------------------------------------
  // 22–23. Checklists for COMPLETED cases
  // -----------------------------------------------------------------------
  let checklistInstanceCount = 0;

  // Create checklist templates (if not already present)
  const timeoutTemplateId = await ensureChecklistTemplate(client, facilityId, 'TIMEOUT', 'Surgical Timeout', adminId);
  const debriefTemplateId = await ensureChecklistTemplate(client, facilityId, 'DEBRIEF', 'Post-Case Debrief', adminId);

  const completedCases = createdCases.filter(c => c.def.status === 'COMPLETED');
  const anesthesiaId = userIds['demo-anesthesia'];
  const scrubId = userIds['demo-scrub'];

  for (let i = 0; i < completedCases.length; i++) {
    const cc = completedCases[i];
    const isUnresolvedSignature = i === completedCases.length - 1; // last completed case
    const isFlaggedReview = i === completedCases.length - 2; // second-to-last

    // TIMEOUT checklist
    const timeoutInstance = await client.query<{ id: string }>(
      `INSERT INTO case_checklist_instance (
         case_id, facility_id, type, template_version_id, status, room_id,
         started_at, completed_at, created_by_user_id
       ) VALUES ($1,$2,'TIMEOUT',$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        cc.caseId, facilityId, timeoutTemplateId,
        isUnresolvedSignature ? 'IN_PROGRESS' : 'COMPLETED',
        roomIds[cc.def.orRoomIndex % roomIds.length],
        isoAgo(Math.abs(cc.def.dayOffset) + 0.1),
        isUnresolvedSignature ? null : isoAgo(Math.abs(cc.def.dayOffset)),
        circulatorId,
      ],
    );
    checklistInstanceCount++;

    // Timeout responses
    for (const itemKey of ['patient_identity', 'procedure_confirmed', 'site_marked', 'consent_signed']) {
      await client.query(
        `INSERT INTO case_checklist_response (instance_id, item_key, value, completed_by_user_id, completed_at)
         VALUES ($1, $2, 'true', $3, $4)`,
        [timeoutInstance.rows[0].id, itemKey, circulatorId, isoAgo(Math.abs(cc.def.dayOffset))],
      );
    }

    // Timeout signatures
    await client.query(
      `INSERT INTO case_checklist_signature (instance_id, role, signed_by_user_id, method)
       VALUES ($1, 'SURGEON', $2, 'LOGIN')`,
      [timeoutInstance.rows[0].id, cc.prefCard.surgeonId],
    );
    await client.query(
      `INSERT INTO case_checklist_signature (instance_id, role, signed_by_user_id, method)
       VALUES ($1, 'CIRCULATOR', $2, 'LOGIN')`,
      [timeoutInstance.rows[0].id, circulatorId],
    );
    if (!isUnresolvedSignature) {
      // Anesthesia signs for all except the "unresolved" case
      await client.query(
        `INSERT INTO case_checklist_signature (instance_id, role, signed_by_user_id, method)
         VALUES ($1, 'ANESTHESIA', $2, 'LOGIN')`,
        [timeoutInstance.rows[0].id, anesthesiaId],
      );
    }

    // DEBRIEF checklist (for all completed cases)
    const debriefInstance = await client.query<{ id: string }>(
      `INSERT INTO case_checklist_instance (
         case_id, facility_id, type, template_version_id, status, room_id,
         started_at, completed_at, created_by_user_id
         ${isFlaggedReview ? ', pending_surgeon_review' : ''}
       ) VALUES ($1,$2,'DEBRIEF',$3,'COMPLETED',$4,$5,$6,$7
         ${isFlaggedReview ? ', true' : ''})
       RETURNING id`,
      [
        cc.caseId, facilityId, debriefTemplateId,
        roomIds[cc.def.orRoomIndex % roomIds.length],
        isoAgo(Math.abs(cc.def.dayOffset)),
        isoAgo(Math.abs(cc.def.dayOffset) - 0.05),
        circulatorId,
      ],
    );
    checklistInstanceCount++;

    // Debrief responses
    for (const itemKey of ['implants_documented', 'counts_correct', 'specimens_labeled', 'equipment_issues']) {
      await client.query(
        `INSERT INTO case_checklist_response (instance_id, item_key, value, completed_by_user_id, completed_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [debriefInstance.rows[0].id, itemKey, itemKey === 'equipment_issues' ? 'No issues' : 'true', scrubId, isoAgo(Math.abs(cc.def.dayOffset) - 0.05)],
      );
    }

    // Debrief signatures
    await client.query(
      `INSERT INTO case_checklist_signature (instance_id, role, signed_by_user_id, method)
       VALUES ($1, 'CIRCULATOR', $2, 'LOGIN')`,
      [debriefInstance.rows[0].id, circulatorId],
    );
    await client.query(
      `INSERT INTO case_checklist_signature (instance_id, role, signed_by_user_id, method)
       VALUES ($1, 'SCRUB', $2, 'LOGIN')`,
      [debriefInstance.rows[0].id, scrubId],
    );
  }

  // -----------------------------------------------------------------------
  // Reserve inventory for some upcoming SCHEDULED cases
  // -----------------------------------------------------------------------
  const greenScheduled = scheduledCases.filter(c => c.def.readiness === 'GREEN').slice(0, 3);
  for (const gc of greenScheduled) {
    // Reserve the first catalog item from this case's preference card
    const catNum = gc.prefCard.itemCatalogNumbers[0];
    const catId = catalogIds[catNum];
    const itemResult = await client.query<{ id: string }>(
      `SELECT id FROM inventory_item
       WHERE facility_id = $1 AND catalog_id = $2 AND availability_status = 'AVAILABLE'
       LIMIT 1`,
      [facilityId, catId],
    );
    if (itemResult.rows.length > 0) {
      await client.query(
        `UPDATE inventory_item SET availability_status = 'RESERVED', reserved_for_case_id = $1
         WHERE id = $2`,
        [gc.caseId, itemResult.rows[0].id],
      );
      await client.query(
        `INSERT INTO inventory_event (
           facility_id, inventory_item_id, event_type, case_id, notes, performed_by_user_id, occurred_at
         ) VALUES ($1, $2, 'RESERVED', $3, 'Reserved for upcoming case', $4, NOW())`,
        [facilityId, itemResult.rows[0].id, gc.caseId, techId],
      );
      inventoryEventCount++;
    }
  }

  // -----------------------------------------------------------------------
  // Return summary
  // -----------------------------------------------------------------------
  return {
    facilityId,
    profile: 'ORTHO_ASC_EXEC_DEMO',
    summary: {
      usersCreated: accounts.length,
      vendorsCreated: VENDORS.length,
      catalogItemsCreated: CATALOG_ITEMS.length,
      inventoryItemsCreated: inventoryItemCount,
      inventoryEventsCreated: inventoryEventCount,
      preferenceCardsCreated: prefCards.length,
      casesCreated,
      checklistInstancesCreated: checklistInstanceCount,
      locationsCreated: LOCATIONS.length,
    },
    accounts,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildStatusChain(finalStatus: string, cancelledReason?: string): Array<{ from: string | null; to: string; reason: string | null }> {
  switch (finalStatus) {
    case 'REQUESTED':
      return [{ from: null, to: 'REQUESTED', reason: null }];
    case 'SCHEDULED':
      return [
        { from: null, to: 'SCHEDULED', reason: null },
      ];
    case 'IN_PROGRESS':
      return [
        { from: null, to: 'SCHEDULED', reason: null },
        { from: 'SCHEDULED', to: 'IN_PROGRESS', reason: null },
      ];
    case 'COMPLETED':
      return [
        { from: null, to: 'SCHEDULED', reason: null },
        { from: 'SCHEDULED', to: 'IN_PROGRESS', reason: null },
        { from: 'IN_PROGRESS', to: 'COMPLETED', reason: null },
      ];
    case 'CANCELLED':
      return [
        { from: null, to: 'SCHEDULED', reason: null },
        { from: 'SCHEDULED', to: 'CANCELLED', reason: cancelledReason ?? null },
      ];
    default:
      return [{ from: null, to: finalStatus, reason: null }];
  }
}

async function ensureChecklistTemplate(
  client: pg.PoolClient,
  facilityId: string,
  type: string,
  name: string,
  createdByUserId: string,
): Promise<string> {
  // Check if template already exists
  const existing = await client.query<{ current_version_id: string }>(
    `SELECT current_version_id FROM checklist_template WHERE facility_id = $1 AND type = $2`,
    [facilityId, type],
  );
  if (existing.rows.length > 0 && existing.rows[0].current_version_id) {
    return existing.rows[0].current_version_id;
  }

  // Create template
  const templateResult = await client.query<{ id: string }>(
    `INSERT INTO checklist_template (facility_id, type, name, is_active)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (facility_id, type) DO UPDATE SET name = $3
     RETURNING id`,
    [facilityId, type, name],
  );
  const templateId = templateResult.rows[0].id;

  // Define items based on type
  const items = type === 'TIMEOUT'
    ? [
        { key: 'patient_identity', label: 'Patient identity confirmed', type: 'boolean', required: true },
        { key: 'procedure_confirmed', label: 'Procedure and side confirmed', type: 'boolean', required: true },
        { key: 'site_marked', label: 'Surgical site marked', type: 'boolean', required: true },
        { key: 'consent_signed', label: 'Consent signed and verified', type: 'boolean', required: true },
      ]
    : [
        { key: 'implants_documented', label: 'All implants documented', type: 'boolean', required: true },
        { key: 'counts_correct', label: 'Instrument and sponge counts correct', type: 'boolean', required: true },
        { key: 'specimens_labeled', label: 'Specimens labeled', type: 'boolean', required: true },
        { key: 'equipment_issues', label: 'Equipment issues to report', type: 'text', required: false },
      ];

  const requiredSignatures = type === 'TIMEOUT'
    ? [
        { role: 'SURGEON', required: true },
        { role: 'CIRCULATOR', required: true },
        { role: 'ANESTHESIA', required: true },
      ]
    : [
        { role: 'CIRCULATOR', required: true },
        { role: 'SCRUB', required: true },
      ];

  const versionResult = await client.query<{ id: string }>(
    `INSERT INTO checklist_template_version (template_id, version_number, items, required_signatures, created_by_user_id)
     VALUES ($1, 1, $2, $3, $4)
     ON CONFLICT (template_id, version_number) DO NOTHING
     RETURNING id`,
    [templateId, JSON.stringify(items), JSON.stringify(requiredSignatures), createdByUserId],
  );

  // If ON CONFLICT hit, fetch existing version
  let versionId: string;
  if (versionResult.rows.length > 0) {
    versionId = versionResult.rows[0].id;
  } else {
    const existingVersion = await client.query<{ id: string }>(
      `SELECT id FROM checklist_template_version WHERE template_id = $1 AND version_number = 1`,
      [templateId],
    );
    versionId = existingVersion.rows[0].id;
  }

  // Update template's current_version_id
  await client.query(
    `UPDATE checklist_template SET current_version_id = $1 WHERE id = $2`,
    [versionId, templateId],
  );

  return versionId;
}
