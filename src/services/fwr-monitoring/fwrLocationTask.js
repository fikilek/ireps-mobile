// src/services/fwr-monitoring/fwrLocationTask.js

import * as TaskManager from "expo-task-manager";

import {
  isFwrAuthUnavailableError,
  submitFwrLocation,
} from "./fwrLocationCallableClient";
import {
  FWR_LOCATION_TASK_NAME,
  FWR_MONITORING_LOG_PREFIX,
} from "./fwrLocationConstants";
import { buildFwrLocationPayload } from "./fwrLocationPayload";

const AUTH_SKIP_LOG_INTERVAL_MS = 60_000;

let lastAuthSkipLogAtMs = 0;

function getNewestLocation(locations = []) {
  return [...locations]
    .filter(Boolean)
    .sort(
      (a, b) =>
        Number(b?.timestamp || 0) - Number(a?.timestamp || 0),
    )[0];
}

function logAuthenticationSkip(locations = [], executionInfo = {}) {
  const nowMs = Date.now();

  if (nowMs - lastAuthSkipLogAtMs < AUTH_SKIP_LOG_INTERVAL_MS) {
    return;
  }

  lastAuthSkipLogAtMs = nowMs;

  console.log(
    `${FWR_MONITORING_LOG_PREFIX} Background GPS skipped: no authenticated session is available.`,
    {
      taskEventId: executionInfo?.eventId || "NAv",
      locationsReceived: Array.isArray(locations) ? locations.length : 0,
    },
  );
}

async function processBackgroundLocations(locations = [], executionInfo = {}) {
  const startedAtMs = Date.now();
  const newestLocation = getNewestLocation(locations);

  console.log(`${FWR_MONITORING_LOG_PREFIX} Background task started.`, {
    taskEventId: executionInfo?.eventId || "NAv",
    locationsReceived: Array.isArray(locations) ? locations.length : 0,
  });

  if (!newestLocation) {
    console.warn(
      `${FWR_MONITORING_LOG_PREFIX} Background task had no GPS positions.`,
    );
    return;
  }

  const payload = buildFwrLocationPayload(newestLocation);
  const response = await submitFwrLocation(payload);

  console.log(`${FWR_MONITORING_LOG_PREFIX} Background GPS submitted.`, {
    taskEventId: executionInfo?.eventId || "NAv",
    capturedAtMs: payload.capturedAtMs,
    accuracyM: payload.location.accuracyM,
    monitoringStatus: response?.monitoringStatus || "NAv",
    elapsedMs: Date.now() - startedAtMs,
  });
}

if (!TaskManager.isTaskDefined(FWR_LOCATION_TASK_NAME)) {
  TaskManager.defineTask(
    FWR_LOCATION_TASK_NAME,
    async ({ data, error, executionInfo }) => {
      const locations = Array.isArray(data?.locations) ? data.locations : [];

      if (error) {
        console.error(`${FWR_MONITORING_LOG_PREFIX} Background task error.`, {
          code: error?.code || "UNKNOWN",
          message: error?.message || String(error),
        });
        return;
      }

      try {
        await processBackgroundLocations(locations, executionInfo);
      } catch (taskError) {
        if (isFwrAuthUnavailableError(taskError)) {
          logAuthenticationSkip(locations, executionInfo);
          return;
        }

        console.error(
          `${FWR_MONITORING_LOG_PREFIX} Background GPS submission failed.`,
          {
            code: taskError?.code || "UNKNOWN",
            message: taskError?.message || String(taskError),
          },
        );
      }
    },
  );
}
