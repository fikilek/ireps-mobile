```mermaid
graph TB
    ROOT[_layout.js Root]
    TABS[Tabs Navigator]
    TABS --> ERFS[ERFs Tab]
    TABS --> PREM[Premises Tab]
    TABS --> TRNS[Transactions Tab]
    TABS --> ASTS[Meters Tab]
    TABS --> MAPS[Maps Tab]
    TABS --> ADMIN[Admin Tab]
    ADMIN --> SP[service-providers/]
    ADMIN --> USERS[users/]
    ADMIN --> PU[pendingUsers/]
    ADMIN --> OP[operations/]
    ADMIN --> REP[reports/ - 15 types]
    ADMIN --> SET[settings/]
    ADMIN --> STO[storage/]
```
