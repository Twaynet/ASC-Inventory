<!-- Changes to this file should be deliberate and rare -->

# Development Governance

This document defines how development is governed in this repository.

It explains **where authority lives**, **how conflicts are resolved**, and
**how both humans and AI tooling must behave** when working in this codebase.

This document is **descriptive and authoritative**, but it is **not SYSTEM LAW**.

---

## Repository Authority Model

Development in this repository is governed by a strict hierarchy.
Lower layers may never contradict higher layers.

### Authority Order (Highest → Lowest)

1. SYSTEM LAW  
2. Development Procedures  
3. Local Configuration  
4. Implementation

---

## 1. SYSTEM LAW (Non-Negotiable)

**Location:**
/docs/LAW/


SYSTEM LAW defines **what must always be true** about the system.

These documents establish:
- Architectural boundaries
- Sources of truth
- Separation of concerns
- Safety and audit guarantees

Examples include:
- Catalog vs Inventory separation
- Device observation vs truth resolution
- Attestation boundaries

Rules:
- SYSTEM LAW is absolute
- SYSTEM LAW changes rarely and deliberately
- Features that violate SYSTEM LAW are invalid
- Convenience, speed, or tooling limitations never override SYSTEM LAW

If an implementation conflicts with SYSTEM LAW, the implementation must change.

---

## 2. Development Procedures (Mandatory During Development)

**Location:**
PRE-FLIGHT.md
RESET-DEV.md


Development Procedures define **how the system must be operated during development**.

They include:
- Required running services
- Port contracts
- Known failure states
- Deterministic recovery steps

Rules:
- Procedures must be followed during development
- Procedures may evolve as tooling evolves
- Procedures do not redefine architecture
- Procedures never override SYSTEM LAW

Procedures exist to support SYSTEM LAW — not to patch around it.

---

## 3. Local Configuration (Machine-Specific)

**Location:**
settings.local.json
.env.local


Local Configuration defines **machine-specific behavior**.

It may include:
- Paths
- Secrets
- Feature flags
- Developer preferences

Rules:
- Configuration affects behavior, not truth
- Configuration is non-authoritative
- Configuration must not encode architectural assumptions
- Configuration may differ between developers

If behavior differs across machines, configuration is the first place to investigate.

---

## 4. Implementation (Code)

Implementation is the **lowest authority layer**.

Rules:
- Code must obey SYSTEM LAW
- Code must follow Procedures during development
- Code must respect Local Configuration
- Code must not reinterpret or bypass higher-order rules

Implementation exists to **express** decisions made at higher layers.

---

## AI Tooling Governance (Claude CLI)

Claude CLI is governed by the same hierarchy as humans.

Claude MUST:
- Load and obey all documents in `/docs/LAW/` before implementation
- Treat SYSTEM LAW as authoritative
- Follow PRE-FLIGHT.md during development tasks
- Use RESET-DEV.md for recovery from broken dev states
- Explicitly flag SYSTEM LAW violations
- Refuse to implement requests that violate SYSTEM LAW

Claude MUST NOT:
- Optimize around SYSTEM LAW
- Invent alternative architectures to “make it work”
- Treat device input as truth
- Collapse Catalog and Inventory concerns
- Encode assumptions that contradict SYSTEM LAW

If a request violates SYSTEM LAW, Claude must explain the violation and propose a compliant alternative.

---

## Conflict Resolution Rules

If a conflict exists:

1. SYSTEM LAW overrides all other documents
2. Procedures explain *how*, not *what*
3. Configuration explains *where*, not *why*
4. Implementation adapts — never the SYSTEM LAW

If resolution is unclear:
- Stop
- Identify the conflicting documents
- Escalate to explicit SYSTEM LAW clarification

---

## Change Discipline

- SYSTEM LAW changes require explicit justification and review
- Governance changes must preserve hierarchy clarity
- Procedural changes must not weaken SYSTEM LAW
- Configuration changes must not affect truth

---

## One-Line Summary

> **SYSTEM LAW defines truth.  
> Procedures define readiness.  
> Configuration defines behavior.  
> Code obeys all three.**
