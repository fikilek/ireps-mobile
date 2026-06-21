# iREPS Mobile — GLOSSARY.md

## Business Terminology

| Term | Full Form | Definition |
|------|-----------|------------|
| ERF | Erf | A cadastral land parcel. The smallest land division unit in the municipal property system. |
| TRN | Transaction | A work record capturing a field action (inspection, reading, installation, etc.) |
| AST | Asset | A meter or infrastructure item (electricity or water) |
| LM | Local Municipality | The geographic boundary of a municipal administration |
| Ward | Ward | An administrative subdivision within an LM |
| Workbase | Workbase | The default LM scope assigned to a user |
| Premise | Premise | A physical property location tied to an ERF |

## Role Hierarchy

| Role | Code | Level | Authority |
|------|------|-------|-----------|
| Service Provider User | SPU | 5 | Full system access, create ADM and MNG users |
| Admin | ADM | 4 | Manage MNG, system settings, user admin |
| Manager | MNG | 3 | Invite SPV, authorize FWR, operations oversight |
| Supervisor | SPV | 2 | Field team supervision, quality assurance |
| Field Worker | FWR | 1 | Data collection, meter discovery, premise capture |
| Guest | GST | 0 | Unauthenticated, sign-in/sign-up only |

## Workflow States (Calendar - Ast/Agreement Event State Machine)

| State | Code | Meaning |
|-------|------|---------|
| ISSUED | ISSUED | Workorder created and assigned to user |
| ACCEPTED | ACCEPTED | User accepted the workorder |
| REJECTED | REJECTED | User rejected the workorder |
| COMPLETED | COMPLETED | Workorder executed with outcome |
| CANCELLED | CANCELLED | Workorder cancelled by manager |

## Execution Outcomes

| Outcome | Meaning |
|---------|---------|
| SUCCESS | Work completed with valid data captured |
| NO_ACCESS | Unable to physically access the meter |
| NO_READING | Access available but no valid reading captured |
| N/A | No outcome recorded yet |

## Technical Terminology

| Term | Definition |
|------|------------|
| MMKV | High-performance key-value storage library (fork of Mozilla's original) |
| WMS | Work Management System - workorder lifecycle management |
| MLCT | Meter Lifecycle Type - categories of meter work |
| WDB | Workorder Dashboard - the WMS analytics dashboard |
| PCode | Place Code - a geographic code in the admin hierarchy |
| ERF Pack | ERF Ward Pack - a bundled set of ERF data for a specific ward, cached in MMKV |
| GeoLibrary | Geo Library - a collection of geographic geometries (centroids, bboxes, polygons) |
| Flight Signal | A counter in GeoContext that increments on every state change |
| Scope Ready | When both lmPcode and wardPcode are truthy, enabling WarehouseContext |
| Ward Cache Key | Composite key \lmPcode__wardPcode\ used for cache identification |

## Origin Channels

| Channel | Description |
|---------|-------------|
| OFFICE | Workorder created by manager/admin via the system |
| FIELD | Workorder created by field user on-site |

## Bucket Types

| Bucket | Description |
|--------|-------------|
| INDIVIDUAL | Work assigned to a specific user (not grouped) |
| TEAM/BATCH | Work assigned to a team or batch (future use) |

## Onboarding Statuses

| Status | Meaning |
|--------|---------|
| IDLE | User registered but not started onboarding |
| PENDING | Email verification sent or password change required |
| AWAITING_SP_CONFIRMATION | Waiting for Service Provider to confirm FWR |
| AWAITING_MNG_CONFIRMATION | Waiting for Manager to approve |
| WORKBASE_REQUIRED | Approved but needs to select a workbase |
| COMPLETED | Onboarding complete, normal app usage |

---

> **Maintainers**: Add new terms as they are introduced into the codebase.
