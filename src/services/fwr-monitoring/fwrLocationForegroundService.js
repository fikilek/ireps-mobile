// src/services/fwr-monitoring/fwrLocationForegroundService.js

import * as Location from "expo-location";

import { FWR_MONITORING_LOG_PREFIX } from "./fwrLocationConstants";
import { submitFwrLocation } from "./fwrLocationCallableClient";
import { buildFwrLocationPayload } from "./fwrLocationPayload";

export async function captureAndSubmitForegroundFwrLocation() {
  console.log(
    `${FWR_MONITORING_LOG_PREFIX} Phase 1: checking foreground permission.`,
  );

  let permission = await Location.getForegroundPermissionsAsync();

  if (permission.status !== Location.PermissionStatus.GRANTED) {
    console.log(
      `${FWR_MONITORING_LOG_PREFIX} Phase 1: requesting foreground permission.`,
    );
    permission = await Location.requestForegroundPermissionsAsync();
  }

  if (permission.status !== Location.PermissionStatus.GRANTED) {
    return {
      success: false,
      code: "FOREGROUND_PERMISSION_DENIED",
      message: "Foreground location permission was not granted.",
    };
  }

  console.log(
    `${FWR_MONITORING_LOG_PREFIX} Phase 1: capturing one GPS position.`,
  );

  const locationResult = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
    mayShowUserSettingsDialog: true,
  });

  const payload = buildFwrLocationPayload(locationResult);

  console.log(
    `${FWR_MONITORING_LOG_PREFIX} Phase 1: sending GPS to callable.`,
    {
      capturedAtMs: payload.capturedAtMs,
      accuracyM: payload.location.accuracyM,
    },
  );

  const response = await submitFwrLocation(payload);

  console.log(
    `${FWR_MONITORING_LOG_PREFIX} Phase 1: callable completed.`,
    response,
  );

  return {
    success: response?.success === true,
    payload,
    response,
  };
}
