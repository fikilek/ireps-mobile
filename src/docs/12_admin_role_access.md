```mermaid
graph LR
    FWR[FWR - Field Worker]
    SPV[SPV - Supervisor]
    MNG[MNG - Manager]
    ADM[ADM - Admin]
    SPU[SPU - Service Provider]

    FWR --> SP_SECT[View SP]
    FWR --> USER_SECT[View Profile]
    FWR --> REP_SECT[Reports]
    FWR --> OPS_SECT[Operations]
    FWR --> STO_SECT[Storage]

    MNG --> PENDING_SECT[Pending Auth]
    SPV --> USERS_SECT[View Users]
    ADM --> SETTINGS_SECT[Settings]
    SPU --> FULL_ACCESS[Full Access All]
```
