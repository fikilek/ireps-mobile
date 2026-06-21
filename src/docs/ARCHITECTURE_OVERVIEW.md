# iREPS Mobile — Architecture Overview

## 1. Project Identity

| Attribute | Detail |
|-----------|--------|
| **Project Name** | iREPS Mobile |
| **Purpose** | Field data collection for municipal infrastructure management |
| **Domain** | Municipal Property & Revenue Management |
| **Platform** | iOS + Android (React Native) |

## 2. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | React Native + Expo | SDK 54 / RN 0.81.5 |
| **Language** | TypeScript | ~5.9.2 |
| **Routing** | Expo Router | ~6.0.24 |
| **State Management** | Redux Toolkit + RTK Query | ^2.11.2 |
| **Persistence** | redux-persist + react-native-mmkv | ^6.0.0 / ^4.1.0 |
| **Backend** | Firebase | ^12.7.0 |
| **Maps** | react-native-maps | 1.20.1 |
| **Forms** | Formik + Yup | ^2.4.9 / ^1.7.1 |
| **UI** | React Native Paper | ^5.14.5 |
| **Charts** | react-native-gifted-charts | ^1.4.73 |

## 3. High-Level Architecture

`mermaid
graph TB
    subgraph "Presentation Layer"
        UI[React Native Screens]
        COMP[Shared Components]
        HOOKS[Custom Hooks]
    end
    subgraph "State & Context Layer"
        RC[Redux Store - RTK Query Slices]
        GC[GeoContext - Scope Management]
        WC[WarehouseContext - Data Aggregation]
    end
    subgraph "Persistence Layer"
        RP[redux-persist]
        MMKV[react-native-mmkv]
    end
    subgraph "Backend Layer"
        FA[Firebase Auth]
        FS[Firestore Database]
        FG[Firebase Storage]
        FNC[Cloud Functions]
    end
    UI --> HOOKS
    HOOKS --> RC
    HOOKS --> GC
    HOOKS --> WC
    GC --> WC
    WC --> RC
    RC --> RP
    RC --> MMKV
    RC --> FA
    RC --> FS
    RC --> FG
    FNC --> FA
    FNC --> FS
`

## 4. Data Flow Overview

Firestore / Storage / Auth -> RTK Query API Slices -> MMKV Cache -> GeoContext -> WarehouseContext -> UI

## 5. Environment Variants

| Variant | App Name | Android Package |
|---------|----------|----------------|
| dev | iREPS Dev | com.ireps.mobile.dev |
| test | iREPS Test | com.ireps.mobile.test |
| trial | iREPS Trial | com.ireps.mobile.trial |
| live | iREPS | com.ireps.mobile |

## 6. Folder Structure

app/ - Expo Router (file-based routes)
src/context/ - React Contexts (Geo, Warehouse, Discovery, Installation)
src/redux/ - RTK Query API slices (18 slices)
src/hooks/ - Custom hooks
src/features/ - UI components by domain
src/services/ - Background sync services
src/storage/ - MMKV persistence helpers
src/navigation/ - Auth guards + bootstrap
src/firebase/ - Firebase initialization
src/docs/ - Design documentation

## 7. RTK Query API Slices

| Slice | Primary Data | Key Endpoint |
|-------|-------------|-------------|
| erfsApi | ERF parcels | getErfsByLmPcodeWardPcode |
| premisesApi | Physical premises | getPremisesByLmPcodeWardPcode |
| astsApi | Assets/meters | getAstsByLmPcodeWardPcode |
| trnsApi | Work transactions | getTrnsByLmPcodeWardPcode |
| authApi | Auth state + profile | getAuthState |
| geoApi | Geography hierarchy | getWardsByLocalMunicipality |
| salesApi | Prepaid revenue | Revenue queries |
| usersApi | User management | Admin CRUD |
