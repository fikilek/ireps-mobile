'''mermaid
erDiagram
    USER ||--o{ WORKBASE : has
    WORKBASE ||--|| LOCAL_MUNICIPALITY : maps
    LOCAL_MUNICIPALITY ||--o{ WARD : contains
    WARD ||--o{ ERF : contains
    ERF ||--o{ PREMISE : has
    PREMISE ||--o{ METER : has
    PREMISE ||--o{ TRANSACTION : has
    METER ||--o{ READING : has
    PREMISE {
        string id PK
        string erfId FK
        object address
        object geometry
    }
    METER {
        string astId PK
        string premiseId FK
        string meterType
    }
    TRANSACTION {
        string trnId PK
        string premiseId FK
        string type
        object workflow
    }
'''
