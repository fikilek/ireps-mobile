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
import {
  ensureFwrLocationMonitoringStarted,
  stopFwrLocationMonitoring,
} from "./fwrLocationService";


function explainBackgroundPermission() {
  return new Promise((resolve) => {
    Alert.alert(
      "Allow background location",
      'iREPS monitors FWR and SPV field activity while the app is in the background. On the next Android screen, choose "Allow all the time".',
      [
        {
          text: "Continue",
          onPress: resolve,
        },
      ],
      { cancelable: false },
    );
  });
}

function showMonitoringProblem(result) {
  switch (result?.code) {
    case "BACKGROUND_PERMISSION_DENIED":
      Alert.alert(
        "Background location required",
        'iREPS requires background location for field monitoring. In Android settings, choose "Allow all the time" for location access.',
      );
      return;

    case "FOREGROUND_PERMISSION_DENIED":
      Alert.alert(
        "Location permission required",
        "iREPS requires precise location permission for field monitoring.",
      );
      return;

    case "LOCATION_SERVICES_DISABLED":
      Alert.alert(
        "Phone location is off",
        "Switch on Location on this phone, then reopen iREPS.",
      );
      return;

    case "TASK_MANAGER_UNAVAILABLE":
      Alert.alert(
        "Monitoring build required",
        "This iREPS build does not support background monitoring. Install the latest development build.",
      );
      return;

    default:
      return;
  }
}

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

  const attemptedUidRef = useRef(null);
  const runningUidRef = useRef(null);
  const nonEligibleStateHandledRef = useRef(false);

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
    if (!ready || logoutInProgress) return;

    if (!eligible) {
      attemptedUidRef.current = null;
      runningUidRef.current = null;

      if (nonEligibleStateHandledRef.current) return;
      nonEligibleStateHandledRef.current = true;

      stopFwrLocationMonitoring().catch((error) => {
        console.warn(
          `${FWR_MONITORING_LOG_PREFIX} Could not reconcile monitoring for a noneligible session.`,
          {
            code: error?.code || "UNKNOWN",
            message: error?.message || String(error),
          },
        );
      });
      return;
    }

    nonEligibleStateHandledRef.current = false;

    if (attemptedUidRef.current === uid) return;
    if (runningUidRef.current === uid) return;

    runningUidRef.current = uid;

    console.log(`${FWR_MONITORING_LOG_PREFIX} Phase 2 coordinator started.`, {
      uid,
      role: normalizedRole,
    });

    ensureFwrLocationMonitoringStarted({
      beforeBackgroundPermissionRequest: explainBackgroundPermission,
    })
      .then((result) => {
        attemptedUidRef.current = uid;

        if (!result?.success) {
          showMonitoringProblem(result);
          console.warn(
            `${FWR_MONITORING_LOG_PREFIX} Background monitoring was not started.`,
            result,
          );
          return;
        }

        console.log(
          `${FWR_MONITORING_LOG_PREFIX} Phase 2 monitoring is active.`,
          {
            uid,
            alreadyRunning: result.alreadyRunning,
            startedNow: result.startedNow,
            immediateSubmitted: result.immediateSubmitted,
          },
        );
      })
      .catch((error) => {
        attemptedUidRef.current = uid;

        console.error(`${FWR_MONITORING_LOG_PREFIX} Phase 2 failed.`, {
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
  }, [
    eligible,
    isAuthenticated,
    logoutInProgress,
    normalizedRole,
    ready,
    uid,
  ]);

  return null;
});

export default FwrMonitoringCoordinator;
