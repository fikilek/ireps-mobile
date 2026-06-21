```mermaid
stateDiagram-v2
    [*] --> IDLE: User signs up
    IDLE --> PENDING: Email verification sent
    PENDING --> AWAITING_SP_CONFIRMATION: SP confirms
    AWAITING_SP_CONFIRMATION --> AWAITING_MNG_CONFIRMATION: MNG reviews
    AWAITING_MNG_CONFIRMATION --> WORKBASE_REQUIRED: MNG approves
    WORKBASE_REQUIRED --> COMPLETED: User selects workbase
    COMPLETED --> COMPLETED: Normal usage
```
