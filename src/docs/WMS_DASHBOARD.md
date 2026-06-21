# iREPS Mobile — WMS_DASHBOARD.md

## 1. Overview

The WMS (Work Management System) Dashboard provides real-time analytics for workorder lifecycle management within a selected ward. It is the operational cockpit for managers and supervisors.

**Location**: \pp/(tabs)/admin/operations/dashboard/index.js\

## 2. Data Sources

- **all.trns** from WarehouseContext: All transactions for the active LM+Ward scope
- **geoState** from GeoContext: Current LM and Ward selection

## 3. Filtering Pipeline

Data flows through a 3-stage filter chain:

### 3.1 WMS Type Filter

Filters transactions to WMS lifecycle types only. Uses the \WMS_LCT_TYPES\ constant:

| Code | Full Name | Icon |
|------|-----------|------|
| METER_INSPECTION | Inspections | clipboard-search-outline |
| METER_DISCONNECTION | Disconnections | power-plug-off-outline |
| METER_RECONNECTION | Reconnections | power-plug-outline |
| METER_REMOVAL | Removals | countertop-outline |
| METER_READING | Meter Readings | counter |

### 3.2 Date Filter

| Filter | Behaviour |
|--------|-----------|
| Today | Created after start of today |
| Yesterday | Created between yesterday and today |
| This Week | Created from Monday (or Sunday) of this week |
| All | No date filtering |

### 3.3 Source Filter

| Filter | Behaviour |
|--------|-----------|
| All | Both Office and Field sources |
| Office | Workorders created by manager/admin |
| Field | Workorders created by field user |

## 4. Dashboard Cards

### Header Card
- Displays selected Ward name + LM name
- Shows a split badge: Office count / Field count
- Dark theme (\#0f172a\ background)

### Manager Control Card
- Only visible when source filter is NOT \"Field\"
- Shows stat pills: Total, Awaiting, Accepted, Rejected, Completed, Cancelled
- Navigates to manager control screen for office-issued workorders

### Summary Groups

**Work Source**: Total count split by Office/Field

**Workflow State**: Counts by workflow state

| State | Description |
|-------|-------------|
| ISSUED | Created and assigned, awaiting user response |
| ACCEPTED | User accepted the workorder |
| REJECTED | User rejected the workorder |
| COMPLETED | Workorder executed |
| CANCELLED | Workorder cancelled by manager |

**Execution Outcome**: Counts by execution outcome

| Outcome | Description |
|---------|-------------|
| No Outcome Yet | Not yet completed |
| Success | Completed with valid data |
| No Access | Unable to access meter physically |
| No Reading | Access available but no valid reading |
| Other | Other outcome types |

### Bucket Cards

Top 3 work buckets displayed horizontally with progress bars:
- Bucket name (INDIVIDUAL highlighted as primary)
- Total count
- Progress bar (% complete) + rejected count

### MLCT Breakdown

5 rows showing each WMS type with workflow counts:
- Left: Icon + label + title
- Right: Awaiting / Accepted / Done counts

### Activity Views Menu

Menu entries for drill-down views:
- User Activity: Work assigned to individual users (functional)
- Team Activity: Future release (shows alert)
- SP Activity: Future release (shows alert)

## 5. Attention Queue

6 categories of work needing manager attention, filtered by the same dashboard filters (ward, date, source):

| Category | Icon | Trigger | Level |
|----------|------|---------|-------|
| Rejected Work | close-octagon-outline | User rejected workorder | High |
| Awaiting Over 1h | clock-alert-outline | Not accepted/rejected within 1 hour | Medium |
| Accepted Over 4h | timer-sand | Accepted but not completed within 4 hours | Medium |
| No Access | lock-alert-outline | Completed without physical meter access | High |
| No Reading | counter | Completed without valid meter reading | Medium |
| Data Check | database-alert-outline | Unexpected or missing workflow state | Medium |

Level badges: Clear (green), Medium (amber), High (red)

## 6. Transformation Functions

The dashboard relies on a set of pure transformation functions defined in the screen file:

| Function | Purpose |
|----------|---------|
| \getTrnType()\ | Extract WMS type from transaction |
| \getWorkflowState()\ | Extract workflow state |
| \getExecutionOutcome()\ | Extract execution outcome code |
| \getOriginChannel()\ | Determine Office vs Field origin |
| \getBucketName()\ | Extract bucket/assignment type |
| \hoursSince()\ | Calculate hours since a timestamp |
| \countWmsItems()\ | Aggregate counts by state + outcome |
| \uildAttentionItems()\ | Build attention queue from items |
| \uildBucketCards()\ | Build top 3 bucket summaries |
| \uildTypeRows()\ | Build MLCT breakdown rows |

## 7. Tolerance Constants

| Constant | Value |
|----------|-------|
| AWAITING_TOLERANCE_HOURS | 1 hour |
| ACCEPTED_TOLERANCE_HOURS | 4 hours |

---

> See related diagrams in ./diagrams/13_wms_dashboard_analytics.md
