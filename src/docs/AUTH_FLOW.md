# iREPS Mobile — AUTH_FLOW.md

## 1. Authentication Architecture

Firebase Auth handles email/password authentication. The auth flow is managed by:
- authApi RTK Query slice with real-time listeners
- useAuth hook for centralized auth state
- AuthGate / GuardedGate / GuardedStack route protection components

## 2. Auth Flow Sequence

1. User signs in via src/redux/authApi.js -> signInWithEmailAndPassword
2. onAuthStateChanged listener fires in authApi.getAuthState
3. Real-time Firestore listener starts on users/{uid} document
4. Auth state is cached in Redux via RTK Query
5. AuthGate component reads the state and routes accordingly

## 3. Onboarding State Machine

Statuses: IDLE -> PENDING -> AWAITING_SP_CONFIRMATION -> AWAITING_MNG_CONFIRMATION -> WORKBASE_REQUIRED -> COMPLETED

## 4. Role Hierarchy

| Role | Code | Level | Responsibilities |
|------|------|-------|-----------------|
| Service Provider User | SPU | 5 | Full system access, create ADM/MNG |
| Admin | ADM | 4 | Manage MNG, system settings |
| Manager | MNG | 3 | Invite SPV, authorize FWR |
| Supervisor | SPV | 2 | Field team oversight |
| Field Worker | FWR | 1 | Data collection |
| Guest | GST | 0 | Unauthenticated only |

## 5. Auth API Endpoints

| Endpoint | Type | Description |
|----------|------|-------------|
| getAuthState | Query | Real-time auth + Firestore profile |
| signin | Mutation | Email/password sign in |
| signout | Mutation | Sign out + clear state |
| signup | Mutation | Create GST user via Cloud Function |
| updateProfile | Mutation | Partial profile update |
| setActiveWorkbase | Mutation | Set active workbase |
| updatePassword | Mutation | Change password |
| createAdminUser | Mutation | SPU creates ADM |
| inviteMng | Mutation | SPU/ADM invites MNG |
| inviteAdmin | Mutation | SPU invites ADM |
| inviteSpv | Mutation | MNG invites SPV |
| authorizeFwr | Mutation | MNG authorizes FWR |

## 6. Route Protection

- AuthGate (app/_layout.js): Primary guard for all routing
- GuardedGate (src/navigation/GuardedGate.js): Renders children only when fully authenticated
- GuardedStack (src/navigation/GuardedStack.js): Effect-based guard

---

> See related diagrams in ./diagrams/
