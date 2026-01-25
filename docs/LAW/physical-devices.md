
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

### Non-Guarantee

A DeviceEvent is **not evidence** of:
- Item identity
- Item availability
- Item sterility
- Item ownership
- Case readiness

DeviceEvents are **inputs** only and must be validated through
inventory resolution and attestation workflows.

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

### Inventory Boundary Rule

DeviceEvents may:
- Trigger lookup
- Initiate workflows
- Populate candidate inputs

DeviceEvents may **never**:
- Directly create inventory
- Directly decrement inventory
- Directly satisfy a case requirement
- Directly mark readiness

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
