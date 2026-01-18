# Surgeon Preference Card Specification
Version: 1.0  
Project: ASC Inventory Truth

---

## Purpose

This document defines the structure and required fields of a **Surgeon Preference Card (SPC)**.

A Surgeon Preference Card represents a surgeon’s default preferences for performing a specific procedure and serves as the **source document** for creating case-specific execution artifacts.

This document does NOT describe Case Cards or case-instance execution records.

---

## 1. Surgeon Preference Card Metadata (Required)

- SPCID (system-generated, immutable)
- Owner Surgeon
- Procedure Code(s) (CPT and/or internal procedure key)
- Version Identifier (semantic or implicit via audit log)
- Status
  - Draft
  - Active
  - Inactive
- Last Edited Date/Time (UTC preferred)
- Edited By (role-based identifier)
- Audit Log
  - Timestamp
  - Editor
  - Change Summary
  - Reason for Change

Rules:
- Only ONE Active SPC per Surgeon + Procedure + Facility
- Inactive SPCs are read-only by default
- No patient identifiers permitted

---

## 2. Header Information

- Surgeon Name (Owner)
- Procedure Name (Plain English)
- Procedure Code(s)
- Facility (if facility-specific preferences exist)
- Case Type Applicability
  - Elective
  - Add-On
  - Trauma
  - Revision
- Typical Case Duration
  - Estimated skin-to-skin time
  - Turnover considerations

---

## 3. Patient-Dependent Flags (Non-PHI)

Flags indicate considerations that may apply to some patients but are NOT patient data.

- Allergy-Sensitive Items
  - Latex
  - Iodine
  - Antibiotic alternatives
- Implant Constraints
  - Nickel-free
  - Cemented vs Cementless
- Positioning Risk Flags
  - BMI threshold
  - Joint instability
  - Spine precautions
- Special Considerations
  - Anticoagulation
  - Infection risk
  - Neuromonitoring required

Rules:
- Flags are checkbox-driven
- No free-text patient data allowed

---

## 4. Instrumentation Preferences

### Primary Trays
- Tray Name
- Required (Yes/No)

### Supplemental Trays
- Tray Name
- Indication

### Loose Instruments
- Instrument Name
- Size
- Typical Quantity

### Sterilization Notes
- Flash allowed (Yes/No)
- Peel pack only (Yes/No)

---

## 5. Equipment Preferences

- Energy Devices
  - Device Name
  - Typical Settings
- Suction
- Tourniquet
  - Typical Location
  - Typical Pressure
- Imaging
  - C-arm orientation
- Specialized Devices
  - Navigation
  - Robotics
  - Custom jigs

Each item must specify:
- Typically Required vs Optional
- Open at Setup vs Hold PRN

---

## 6. Supply Preferences

- Gloves
  - Size
  - Sterile vs Exam
- Drapes
- Sponges / Counts
- Implants
  - Vendor
  - System
  - Size Range Typically Needed
- Sutures
  - Type
  - Size
  - Needle
- Disposables
  - Single-use devices

Notes:
- Supplies represent defaults, not guarantees
- Inventory linkage may occur downstream

---

## 7. Medication & Solution Preferences

- Local Anesthetic
  - Drug
  - Typical Concentration
  - Typical Volume
- Antibiotics (preferences only)
- Irrigation
  - Type
  - Typical Volume
  - Additives
- Topical Agents
  - TXA
  - Hemostatic agents

Flags:
- Open by Default
- Hold PRN

---

## 8. Setup & Positioning Preferences

- Typical Patient Position
- Table Configuration
- Padding Requirements
- Mayo Stand
  - Typical Count
  - Placement
- Back Table Layout Notes
- OR Flow Notes
  - Implant opening timing
  - Imaging timing

---

## 9. Surgeon Notes & Conditional Logic

- Surgeon Preference Notes
- Hold / PRN Logic
- Decision Triggers
  - Example: "Open implant X only if condition Y"
- Teaching Case Modifiers
- Revision-Only Additions

Rules:
- Free text allowed here only
- All other sections should be structured

---

## Core Design Principles

- SPCs represent **intent**, not execution
- SPCs are living documents
- Accountability is enforced via audit logging
- SPCs must never contain patient identifiers

---

## Explicit Non-Goals

- SPCs are not case-instance records
- SPCs do not auto-update scheduled cases
- SPCs are not execution guarantees

---
End of Document
