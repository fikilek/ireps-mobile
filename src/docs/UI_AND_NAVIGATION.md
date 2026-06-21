# iREPS Mobile — UI_AND_NAVIGATION.md

## 1. Routing Architecture

The app uses Expo Router with file-based routing. All routes are defined by the folder structure under \pp/\. The root layout (\pp/_layout.js\) wraps all routes with providers and auth guards. Expo Router automatically maps the folder structure to URL paths.

## 2. Root Layout (app/_layout.js)

The root layout establishes the provider hierarchy:

`
Redux Provider
  -> PersistGate (redux-persist rehydration)
    -> GeoProvider (scope management)
      -> WarehouseProvider (data aggregation)
        -> MapProvider (map state)
          -> PaperProvider (Material UI)
            -> SafeAreaProvider
              -> DiscoveryProvider (meter discovery modal)
                -> InstallationProvider (meter installation modal)
                  -> AuthBootstrap (Firebase auth listener)
                  -> AuthGate (route protection)
                  -> Slot (renders current route)
`

## 3. Tab Navigation

The main tab navigator (\pp/(tabs)/_layout.js\) has 6+ tabs:

| Tab | Icon | Route | Description |
|-----|------|-------|-------------|
| ERFs | map-marker-radius-outline | (tabs)/erfs | Erf parcel browsing and selection |
| Premises | office-building-marker-outline | (tabs)/premises | Premise creation, editing, listing |
| TRNs | swap-horizontal | (tabs)/trns | Transaction/workorder management |
| ASTs | counter | (tabs)/asts | Meter/asset management |
| Maps | map-outline | (tabs)/maps | Geospatial view with layers |
| Admin | shield-account-outline | (tabs)/admin | Administrative functions |

There is also a hidden \index\ tab (\href: null\) and a meter-reading/billing tab.

The \MissionDiscoveryModal\ is mounted as a sibling of the Tabs navigator, allowing it to overlay any tab.

## 4. Admin Panel Structure

The admin panel is the largest section, containing:

### Dashboard (admin/index.js)
Role-based card menu with sections:
- **Operational Management**: Service Providers, User Profile, Users, Pending Authorizations
- **System Configuration**: Dropdown Settings (ADM/SPU only)
- **Reporting & Intelligence**: Management Reports, Operations Hub
- **Local Storage**: 4 offline queue management screens

### Operations Hub (admin/operations/index.js)
Grid of 8 operational tools:
- WMS Dashboard: Workorder lifecycle analytics
- Operational Teams: Personnel deployment
- My Workorders: Assignment management
- Geo-Fencing: Spatial jurisdiction boundaries
- Field Analytics: Deployment performance
- Revenue Analytics: LM prepaid revenue
- Quality Assurance: Discovery document review

### Reports (admin/reports/index.js)
15+ report types across 3 categories:
- **Registry & Inventory**: Meter, Premise, ERF, Ward, Workbase, SP, User
- **Activity Reports**: No Access, User Activity, Normalisation, Anomaly
- **Revenue Reports**: Prepaid Revenue Report & Dashboard

## 5. Onboarding Screens

The onboarding group (\pp/onboarding/\) contains screens for each onboarding state:
- change-password
- select-workbase
- verify-email
- verify-phone
- complete-invited-profile
- confirm-appointment (for MNG/ADM confirmation)
- waiting screens (awaiting-sp, awaiting-mng-confirmation)

## 6. Auth Guards

Three guard components protect routes:

| Component | Location | Purpose |
|-----------|----------|---------|
| AuthGate | app/_layout.js | Primary guard: handles all routing decisions based on auth state |
| GuardedGate | src/navigation/GuardedGate.js | Renders Slot children only when fully authenticated and onboarded |
| GuardedStack | src/navigation/GuardedStack.js | Effect-based redirect: monitors auth state changes |

---

> See related diagrams in ./diagrams/11_tab_navigation_map.md, 12_admin_role_access.md
