# LAW: Device Events System  
**ASC Inventory Truth**

**Status:** SUBORDINATE LAW (DERIVED)  
**Authority Level:** SUBSYSTEM LAW (Must not conflict with SYSTEM LAW)  
**Parent LAW:** `docs/LAW/physical-devices.md`  
**Applies To:** All humans, all AI agents (including Claude CLI), all code paths that create/read/process DeviceEvents  
**Last Updated:** 2026-01-25

---

## 0. Subordination Clause (Non-Negotiable)

This document is **subordinate** to `docs/LAW/physical-devices.md`.

If any statement in this document conflicts with `physical-devices.md`, then:
1. `physical-devices.md` prevails
2. This document must be amended to remove the conflict
3. No implementation may proceed under conflicting assumptions

This document exists to govern **how DeviceEvents behave inside the system** once emitted.

---

## 1. Definition of DeviceEvent

A **DeviceEvent** is an immutable record of **device-originated input** (scan, presence, or user/device input) captured by the system.

DeviceEvents are:
- Non-authoritative
- Append-only
- Immutable
- Auditable as input evidence
- Never sufficient to establish inventory truth

DeviceEvents are **inputs only**, not truth.

---

## 2. Reference to Parent LAW (Physical Devices)

This document enforces and operationalizes the parent LAW principles:

- The Inventory Truth Engine must never depend on device APIs
- Devices emit events, not truth
- DeviceEvents are not evidence of identity, availability, sterility, ownership, or readiness
- DeviceEvents may trigger lookup and workflows, but may not directly mutate truth-state

See: `docs/LAW/physical-devices.md`

---

## 3. DeviceEvent Canonical Schema (Authoritative)

All DeviceEvents MUST conform to this normalized structure:

```ts
DeviceEvent {
  deviceId: string
  deviceType: "barcode" | "rfid" | "nfc" | "other"
  payloadType: "scan" | "presence" | "input"
  rawValue: string
  timestamp: ISO8601
}
