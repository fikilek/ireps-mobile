```mermaid
stateDiagram-v2
    [*] --> IDLE
    IDLE --> CHECKING_NETWORK: NetInfo event
    CHECKING_NETWORK --> OFFLINE_WAIT: No connection
    CHECKING_NETWORK --> PROCESSING: Online + pending items
    OFFLINE_WAIT --> CHECKING_NETWORK: Network restored
    PROCESSING --> SYNCING_ITEM: Lock acquired
    SYNCING_ITEM --> UPLOAD_MEDIA: Upload local URIs
    UPLOAD_MEDIA --> CALL_FUNCTION: Call Cloud Function
    CALL_FUNCTION --> MARK_SUCCESS: success = true
    CALL_FUNCTION --> RETRY_LATER: Premise not ready
    CALL_FUNCTION --> MARK_FAILED: Other error
    RETRY_LATER --> SYNCING_ITEM: Keep PENDING
    MARK_SUCCESS --> NEXT_ITEM
    MARK_FAILED --> NEXT_ITEM
    NEXT_ITEM --> SYNCING_ITEM: More items
    NEXT_ITEM --> IDLE: Queue empty
```
