# iREPS Mobile — DATABASE_MODEL.md

## 1. Firebase Configuration

The app uses Firebase with four services:

1. **Authentication**: Email/password with custom claims for role-based access
2. **Firestore**: NoSQL database with real-time snapshot listeners
3. **Storage**: File storage for media uploads (premise photos, meter photos, account data)
4. **Cloud Functions**: Server-side business logic with validation

### Firebase Initialization

\src/firebase/index.js\ initializes Firebase with:
- \initializeFirestore(app, { experimentalForceLongPolling: true, useFetchStreams: false })\ - Long polling stabilizes Firestore connections in environments with unreliable WebSocket support
- \initializeAuth(app, { persistence: getReactNativePersistence(MMKV) })\ - Auth state persisted to MMKV for fast restarts

## 2. Firebase Projects

Two Firebase projects are configured (one active, one commented):

| Environment | Project ID | API Key | Status |
|-------------|------------|---------|--------|
| Staging | ireps2 | AIzaSyAkE9nf-G-gW9Pv9ZSxRzyr0FL3G6XXJA8 | Active (current) |
| Production | ipreps (ireps-5c3e9) | AIzaSyCivNf1fZ_8d692nLhjpuiRwSqZVBofMIM | Commented out |

## 3. Firestore Collections

### users/{uid}

| Field | Type | Description |
|-------|------|-------------|
| email | string | User email address |
| role | string | SPU, ADM, MNG, SPV, FWR, GST |
| identity | object | name, surname, idNumber |
| contact | object | phoneNumber |
| employment | object | serviceProvider, role |
| access | object | workbases[], activeWorkbase |
| onboarding | object | status, steps, mustChangePassword |
| profile | object | profilePicture, bio |
| metadata | object | createdAtMs, updatedAtMs, createdByUid |

### ireps_erfs/{erfId}

| Field | Type | Description |
|-------|------|-------------|
| erfId | string | Unique ERF identifier |
| erfNo | string | Human-readable ERF number |
| admin | object | Country, Province, District, LocalMunicipality, Ward hierarchy |
| centroid | GeoPoint | Geographic center point |
| bbox | array | Bounding box coordinates [minLng, minLat, maxLng, maxLat] |
| geometry | object/string | Polygon geometry (may be stringified GeoJSON) |
| premises | array | Array of premise IDs on this ERF |
| metadata | object | createdAt, updatedAt, version |

### premises/{premiseId}

| Field | Type | Description |
|-------|------|-------------|
| id | string | Premise identifier |
| erfId | string | Parent ERF ID |
| address | object | Street, suburb, city, postal code |
| propertyType | string | Residential, Commercial, Industrial, etc. |
| occupancy | object | Occupied, Vacant, Status details |
| geometry | object/string | Premise location geometry |
| services | array | Electricity, Water service details |
| media | array | Photos with tags and download URLs |
| parents | object | lmPcode, wardPcode, erfId |
| metadata | object | createdAt, updatedAt, createdByUid |

### trns/{trnId}

| Field | Type | Description |
|-------|------|-------------|
| trnId | string | Transaction identifier |
| accessData | object | premiseId, erfId, trnType, hasAccess |
| workflow | object | state (ISSUED, ACCEPTED, REJECTED, COMPLETED, CANCELLED) |
| assignment | object | bucket, issuedByUid, acceptedRejectedAt |
| executionOutcome | object | code, outcome, details |
| origin | object | channel (OFFICE or FIELD) |
| metadata | object | createdAt, updatedAt, createdByUid |
| media | array | Execution photos |

### asts/{astId}

| Field | Type | Description |
|-------|------|-------------|
| astId | string | Asset identifier |
| astData | object | astNo, astType, astId |
| installation | object | Installed at location, date, status |
| lifecycle | object | Active, Decommissioned, etc. |
| premiseId | string | Parent premise ID |
| metadata | object | createdAt, updatedAt |

## 4. Key Firestore Indexes

Custom composite indexes required:
- \ireps_erfs\: \dmin.localMunicipality.pcode ASC, metadata.updatedAt DESC\
- \ireps_erfs\: \dmin.localMunicipality.pcode ASC, admin.ward.pcode ASC, metadata.updatedAt DESC\
- \premises\: \parents.lmPcode ASC, parents.wardPcode ASC, metadata.updatedAt DESC\

## 5. Security Model

- **Authentication required** for all reads/writes to Firestore and Storage
- **Role-based access** controlled via Firebase custom claims + Firestore profile data
- **Scope validation** ensures users only access their authorized LM/workbase
- **Write operations** go through Cloud Functions for server-side validation
- **Cloud Functions** enforce business rules before data is committed

## 6. Cloud Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| signupFieldWorker | Callable | Register new FWR user |
| createAdminUser | Callable | SPU creates ADM user |
| inviteManagerUser | Callable | SPU/ADM invites MNG |
| inviteAdminUser | Callable | SPU invites ADM |
| inviteSupervisorUser | Callable | MNG invites SPV |
| authorizeFieldWorker | Callable | MNG authorizes FWR |
| onPremiseCreateCallable | Callable | Validate and save premise |
| onMeterDiscoveryCallable | Callable | Validate and save discovery TRN |

---

> See related diagrams in ./diagrams/09_entity_relationships.md, 15_firestore_data_model.md
