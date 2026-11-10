# Verification — MD BGO Unallocation DEV Compatibility

- `scripts/ci/verify-mobile-env.cjs dev` passed for `iREPS Dev`, Android package `com.ireps.mobile.dev`, Firebase `ireps2`.
- EAS update export completed successfully for Android with explicit `APP_ENV=dev` and `EXPO_PUBLIC_APP_ENV=dev`.
- EAS readback (`eas update:list --branch development --limit 5 --json`) confirmed the update group as the newest Android update on the `development` branch and runtime `exposdk:54.0.0`.
- Owner review: pending on hosted DEV.
