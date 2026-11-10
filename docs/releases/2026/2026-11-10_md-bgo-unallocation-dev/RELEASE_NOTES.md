# Release Notes — MD BGO Unallocation DEV Compatibility

Date: 10 November 2026
Environment: DEV (`ireps2`)

This mobile OTA republishes the iREPS Mobile JavaScript bundle from GitHub `main` so the DEV mobile client is aligned with the MD BGO batch acceptance callable deployed in the corresponding web/functions release. No mobile application source changed. The mobile MD BGO workflow is unchanged.

The server now safely serializes acceptance with an office unallocation request. Workers may need to reopen the app while online to receive the OTA. No field action is required for this compatibility update.
