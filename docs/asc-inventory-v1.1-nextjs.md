# ASC Inventory Truth System — v1.1 (Next.js / Device-Ready)

## Purpose

This document defines a **clinically honest, future-proof inventory system** for Ambulatory Surgery Centers (ASCs).

The system is designed to:
- Prevent missing required items after anesthesia induction
- Preserve inventory truth independent of staff memory
- Survive staff turnover, ownership change, and technology evolution
- Support future device and peripheral integrations without core rewrites

This is a **web-first SaaS** with a **device-agnostic integration layer**.

---

## Non-Negotiable North-Star Statement

At the day-before cutoff, the system must be able to truthfully state:

> **“All required items verified and locatable.”**

If that statement cannot be made truthfully, the system must fail loudly *before anesthesia*.

---

## Core Problem Being Solved (LOCKED)

Prevent silent capital loss and intraoperative surprises by ensuring that:

- High-value inventory
- Implants
- Loaners
- Unique instruments

are verified, locatable, sterile, and available **for each case**.

---

## Immutable Design Principles

1. Truth lives in systems, not people
2. Preference cards assert expectation — inventory asserts reality
3. Surgeons have ultimate authority over required items
4. Shared responsibility requires explicit attestation
5. Failure after induction is unacceptable
6. Simplicity beats completeness
7. Device integration must not pollute domain truth

---

## Architectural Overview (NEW)

This system is explicitly **layered**:


┌────────────────────────────┐
│ UI / Clients │ ← Next.js (React, TypeScript)
└────────────▲───────────────┘
│ API
┌────────────┴───────────────┐
│ Application Layer │ ← Case workflow, readiness logic
└────────────▲───────────────┘
│ Domain API
┌────────────┴───────────────┐
│ Inventory Truth Engine │ ← Pure domain (NO devices)
└────────────▲───────────────┘
│ Events
┌────────────┴───────────────┐
│ Device Integration Adapter │ ← Pluggable, optional
└────────────▲───────────────┘
│
Physical Devices


**Rule:**  
The Inventory Truth Engine must never depend on device APIs.

---

## Device Integration Adapter (NEW — CRITICAL)

### Purpose

Provide a future-proof mechanism to integrate:
- Barcode scanners
- RFID readers
- NFC readers
- Serial / USB devices
- Vendor-specific hardware
- Network-based scanners

**without modifying core inventory logic**.

---

### Core Principle

> Devices emit **events**, not truth.

Truth is decided only by:
- Inventory events
- Case association
- Attestation rules

---

## Supported Device Integration Modes

### 1. Keyboard Wedge (Baseline)
- Scanner acts as keyboard
- Works in any browser
- Zero configuration
- Primary v1 assumption

### 2. Browser APIs (Progressive Enhancement)
- WebHID
- WebSerial
- WebUSB
- WebNFC (where supported)

Used only when:
- Explicitly enabled
- User-granted permission
- Browser-supported

### 3. Local Device Bridge (Optional Future)
A lightweight local agent that:
- Talks to hardware drivers
- Emits normalized device events to SaaS API
- Runs independently of browser

---

## Device Adapter Contract (IMPORTANT)

All devices must emit **DeviceEvents** in a normalized format:

```ts
DeviceEvent {
  deviceId: string
  deviceType: "barcode" | "rfid" | "nfc" | "other"
  payloadType: "scan" | "presence" | "input"
  rawValue: string
  timestamp: ISO8601
}


