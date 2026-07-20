// src/services/fwr-monitoring/FwrMonitoringCoordinator.js

import { memo, useEffect, useRef } from "react";
import { Alert } from "react-native";

import { useAuth } from "../../hooks/useAuth";
import {
  ACTIVE_ACCOUNT_STATUS,
  COMPLETED_ONBOARDING_STATUSES,
  FWR_MONITORING_LOG_PREFIX,
  MONITORED_ROLES,
} from "./fwrLocationConstants";
import { captureAndSubmitForegroundFwrLocation } from "./fwrLocationForegroundService";

const FwrMonitoringCoordinator = memo(function FwrMonitoringCoordinator() {
  const {
    user,
    profile,
    role,
    status,
    ready,
    isAuthenticated,
    logoutInProgress,
  } = useAuth();

  const completedUidRef = useRef(null);
  const runningUidRef = useRef(null);
  const permissionAlertShownRef = useRef(false);

  const normalizedRole = String(role || "").trim().toUpperCase();
  const normalizedStatus = String(status || "").trim().toUpperCase();
  const normalizedAccountStatus = String(
    profile?.accountStatus || "",
  )
    .trim()
    .toUpperCase();

  const uid = user?.uid || null;

  const eligible =
    ready &&
    isAuthenticated &&
    !logoutInProgress &&
    Boolean(uid) &&
    MONITORED_ROLES.includes(normalizedRole) &&
    COMPLETED_ONBOARDING_STATUSES.includes(normalizedStatus) &&
    normalizedAccountStatus === ACTIVE_ACCOUNT_STATUS;

  useEffect(() => {
    if (!isAuthenticated || logoutInProgress) {
      completedUidRef.current = null;
      runningUidRef.current = null;
      permissionAlertShownRef.current = false;
      return;
    }

    if (!eligible) return;
    if (completedUidRef.current === uid) return;
    if (runningUidRef.current === uid) return;

    let cancelled = false;
    runningUidRef.current = uid;

    console.log(`${FWR_MONITORING_LOG_PREFIX} Phase 1 coordinator started.`, {
      uid,
      role: normalizedRole,
    });

    captureAndSubmitForegroundFwrLocation()
      .then((result) => {
        if (cancelled) return;

        if (result?.success) {
          completedUidRef.current = uid;
          console.log(
            `${FWR_MONITORING_LOG_PREFIX} Phase 1 completed successfully.`,
            { uid },
          );
          return;
        }

        if (
          result?.code === "FOREGROUND_PERMISSION_DENIED" &&
          !permissionAlertShownRef.current
        ) {
          permissionAlertShownRef.current = true;
          Alert.alert(
            "Location permission required",
            "iREPS requires location permission for field monitoring. Please allow location access and sign in again.",
          );
        }

        console.warn(
          `${FWR_MONITORING_LOG_PREFIX} Phase 1 did not submit a location.`,
          result,
        );
      })
      .catch((error) => {
        if (cancelled) return;

        console.error(`${FWR_MONITORING_LOG_PREFIX} Phase 1 failed.`, {
          uid,
          code: error?.code || "UNKNOWN",
          message: error?.message || String(error),
        });
      })
      .finally(() => {
        if (runningUidRef.current === uid) {
          runningUidRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    eligible,
    isAuthenticated,
    logoutInProgress,
    normalizedRole,
    uid,
  ]);

  return null;
});

export default FwrMonitoringCoordinator;
