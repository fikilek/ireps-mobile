// src/services/fwr-monitoring/fwrLocationConstants.js

export const MONITORED_ROLES = Object.freeze(["FWR", "SPV"]);

export const COMPLETED_ONBOARDING_STATUSES = Object.freeze([
  "COMPLETE",
  "COMPLETED",
]);

export const ACTIVE_ACCOUNT_STATUS = "ACTIVE";

export const FWR_LOCATION_TASK_NAME = "IREPS_FWR_BACKGROUND_LOCATION";
export const FWR_LOCATION_TIME_INTERVAL_MS = 30_000;
export const FWR_LOCATION_DISTANCE_INTERVAL_M = 10;

export const FWR_LOCATION_NOTIFICATION_TITLE = "iREPS Field Monitoring";
export const FWR_LOCATION_NOTIFICATION_BODY =
  "Location monitoring is active.";

export const FWR_MONITORING_LOG_PREFIX = "[FWR MONITORING]";
