// src/services/fwr-monitoring/fwrLocationService.js

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { markFwrMonitoringSignedOut } from "./fwrLocationCallableClient";
import {
  FWR_LOCATION_DISTANCE_INTERVAL_M,
  FWR_LOCATION_NOTIFICATION_BODY,
  FWR_LOCATION_NOTIFICATION_TITLE,
  FWR_LOCATION_TASK_NAME,
  FWR_LOCATION_TIME_INTERVAL_MS,
  FWR_MONITORING_LOG_PREFIX,
} from "./fwrLocationConstants";
import { captureAndSubmitForegroundFwrLocation } from "./fwrLocationForegroundService";

async function getOrRequestForegroundPermission() {
  let permission = await Location.getForegroundPermissionsAsync();

  if (permission.status !== Location.PermissionStatus.GRANTED) {
    console.log(
      `${FWR_MONITORING_LOG_PREFIX} Requesting foreground location permission.`,
    );
    permission = await Location.requestForegroundPermissionsAsync();
  }

  return permission;
}

async function getOrRequestBackgroundPermission() {
  let permission = await Location.getBackgroundPermissionsAsync();

  if (permission.status !== Location.PermissionStatus.GRANTED) {
    console.log(
      `${FWR_MONITORING_LOG_PREFIX} Requesting background location permission.`,
    );
    permission = await Location.requestBackgroundPermissionsAsync();
  }

  return permission;
}

export async function isFwrLocationMonitoringRunning() {
  return Location.hasStartedLocationUpdatesAsync(FWR_LOCATION_TASK_NAME);
}

export async function ensureFwrLocationMonitoringStarted({
  beforeBackgroundPermissionRequest = null,
} = {}) {
  console.log(`${FWR_MONITORING_LOG_PREFIX} Background startup check.`);

  const taskManagerAvailable = await TaskManager.isAvailableAsync();
  if (!taskManagerAvailable) {
    return {
      success: false,
      code: "TASK_MANAGER_UNAVAILABLE",
      message: "TaskManager is unavailable in this app build.",
    };
  }

  const backgroundLocationAvailable =
    await Location.isBackgroundLocationAvailableAsync();

  if (!backgroundLocationAvailable) {
    return {
      success: false,
      code: "BACKGROUND_LOCATION_UNAVAILABLE",
      message: "Background location is unavailable on this device.",
    };
  }

  const locationServicesEnabled = await Location.hasServicesEnabledAsync();
  if (!locationServicesEnabled) {
    return {
      success: false,
      code: "LOCATION_SERVICES_DISABLED",
      message: "The phone location service is switched off.",
    };
  }

  const foregroundPermission = await getOrRequestForegroundPermission();
  if (foregroundPermission.status !== Location.PermissionStatus.GRANTED) {
    return {
      success: false,
      code: "FOREGROUND_PERMISSION_DENIED",
      message: "Foreground location permission was not granted.",
      canAskAgain: foregroundPermission.canAskAgain === true,
    };
  }

  const existingBackgroundPermission =
    await Location.getBackgroundPermissionsAsync();

  if (
    existingBackgroundPermission.status !== Location.PermissionStatus.GRANTED &&
    typeof beforeBackgroundPermissionRequest === "function"
  ) {
    await beforeBackgroundPermissionRequest();
  }

  const backgroundPermission = await getOrRequestBackgroundPermission();
  if (backgroundPermission.status !== Location.PermissionStatus.GRANTED) {
    return {
      success: false,
      code: "BACKGROUND_PERMISSION_DENIED",
      message: "Background location permission was not granted.",
      canAskAgain: backgroundPermission.canAskAgain === true,
    };
  }

  const alreadyRunning = await isFwrLocationMonitoringRunning();

  if (!alreadyRunning) {
    console.log(
      `${FWR_MONITORING_LOG_PREFIX} Starting Android foreground location service.`,
      {
        taskName: FWR_LOCATION_TASK_NAME,
        timeIntervalMs: FWR_LOCATION_TIME_INTERVAL_MS,
        distanceIntervalM: FWR_LOCATION_DISTANCE_INTERVAL_M,
      },
    );

    await Location.startLocationUpdatesAsync(FWR_LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: FWR_LOCATION_TIME_INTERVAL_MS,
      distanceInterval: FWR_LOCATION_DISTANCE_INTERVAL_M,
      mayShowUserSettingsDialog: true,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: FWR_LOCATION_NOTIFICATION_TITLE,
        notificationBody: FWR_LOCATION_NOTIFICATION_BODY,
        killServiceOnDestroy: false,
      },
    });
  }

  let immediateSubmission = null;

  try {
    immediateSubmission = await captureAndSubmitForegroundFwrLocation();
  } catch (error) {
    console.warn(
      `${FWR_MONITORING_LOG_PREFIX} Immediate GPS submission failed; background service remains active.`,
      {
        code: error?.code || "UNKNOWN",
        message: error?.message || String(error),
      },
    );
  }

  const running = await isFwrLocationMonitoringRunning();

  console.log(`${FWR_MONITORING_LOG_PREFIX} Background startup completed.`, {
    alreadyRunning,
    running,
    immediateSubmitted: immediateSubmission?.success === true,
  });

  return {
    success: running,
    code: running ? "MONITORING_ACTIVE" : "MONITORING_NOT_STARTED",
    alreadyRunning,
    startedNow: !alreadyRunning && running,
    immediateSubmitted: immediateSubmission?.success === true,
  };
}

export async function stopFwrLocationMonitoring({
  markSignedOut = false,
} = {}) {
  const result = {
    success: true,
    stopped: false,
    statusUpdated: false,
    errors: [],
  };

  console.log(`${FWR_MONITORING_LOG_PREFIX} Monitoring shutdown started.`, {
    markSignedOut,
  });

  try {
    const running = await isFwrLocationMonitoringRunning();

    if (running) {
      await Location.stopLocationUpdatesAsync(FWR_LOCATION_TASK_NAME);
      result.stopped = true;
    }
  } catch (error) {
    result.success = false;
    result.errors.push({
      step: "STOP_LOCATION_TASK",
      code: error?.code || "UNKNOWN",
      message: error?.message || String(error),
    });
  }

  if (markSignedOut) {
    try {
      const response = await markFwrMonitoringSignedOut();
      result.statusUpdated = response?.success === true;
    } catch (error) {
      result.success = false;
      result.errors.push({
        step: "MARK_SIGNED_OUT",
        code: error?.code || "UNKNOWN",
        message: error?.message || String(error),
      });
    }
  }

  console.log(`${FWR_MONITORING_LOG_PREFIX} Monitoring shutdown completed.`, {
    stopped: result.stopped,
    statusUpdated: result.statusUpdated,
    errorCount: result.errors.length,
  });

  return result;
}

export async function stopFwrLocationMonitoringAndMarkSignedOut() {
  return stopFwrLocationMonitoring({ markSignedOut: true });
}
