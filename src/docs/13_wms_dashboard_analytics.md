```mermaid
graph TB
    subgraph "Data Sources"
        ALL_TRNS[all.trns from Warehouse]
        GEO[geoState: LM + Ward]
    end
    subgraph "Filter Pipeline"
        DATE_FILTER[Date: Today/Yesterday/This Week/All]
        SOURCE_FILTER[Source: All/Office/Field]
        WMS_FILTER[Type: INSP/DCN/RCN/REM/MREAD]
    end
    subgraph "Dashboard UI Cards"
        HEADER[Header: Ward + LM Name + Source Badge]
        MGMT[Manager Control Card with StatPills]
        SUMMARY[Summary Groups x3]
        BUCKETS[Bucket Cards with Progress]
        MLCT[MLCT Breakdown x5 Types]
        ATTENTION[Attention Queue x6 Categories]
    end
    ALL_TRNS --> WMS_FILTER
    ALL_TRNS --> DATE_FILTER
    ALL_TRNS --> SOURCE_FILTER
    ALL_TRNS --> MLCT
    ALL_TRNS --> SUMMARY
    ALL_TRNS --> ATTENTION
    GEO --> HEADER
```
