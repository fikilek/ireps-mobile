```mermaid
graph TB
    subgraph "Firestore Collections"
        USERS[users/{uid}]
        ERFS[ireps_erfs/{erfId}]
        PREMS[premises/{premiseId}]
        TRNS[trns/{trnId}]
        ASTS[asts/{astId}]
    end
    subgraph "Firebase Storage"
        PM[premises/ - premise photos]
        MM[meters/ - discovery photos]
    end
    subgraph "Cloud Functions"
        FN_SIGNUP[signupFieldWorker]
        FN_PREMISE[onPremiseCreateCallable]
        FN_METER[onMeterDiscoveryCallable]
    end
    ERFS --> PREMS
    PREMS --> TRNS
    PREMS --> ASTS
    PM --> PREMS
    MM --> ASTS
```
