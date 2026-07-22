// src/services/fwr-monitoring/fwrLocationCallableClient.js

import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";

import { auth, functions } from "../../firebase";

const AUTH_READY_TIMEOUT_MS = 10_000;

export const FWR_AUTH_UNAVAILABLE_CODE = "FWR_AUTH_UNAVAILABLE";

const submitLocationCallable = httpsCallable(
  functions,
  "submitFwrLocationCallable",
);

const updateStatusCallable = httpsCallable(
  functions,
  "updateFwrMonitoringStatusCallable",
);

function createAuthUnavailableError(message) {
  const error = new Error(message);
  error.code = FWR_AUTH_UNAVAILABLE_CODE;
  return error;
}

export function isFwrAuthUnavailableError(error) {
  return error?.code === FWR_AUTH_UNAVAILABLE_CODE;
}

async function waitForAuthenticatedUser() {
  if (auth.currentUser) return auth.currentUser;

  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe = null;

    const cleanup = () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };

    const resolveOnce = (user) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      cleanup();
      resolve(user);
    };

    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      cleanup();
      reject(error);
    };

    const timeoutId = setTimeout(() => {
      rejectOnce(
        createAuthUnavailableError(
          "Firebase authentication was not restored before the location timeout.",
        ),
      );
    }, AUTH_READY_TIMEOUT_MS);

    unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        // Firebase can briefly emit null while persisted authentication is
        // still being restored during an app/Metro reload. Do not reject on
        // that temporary state; keep waiting until the timeout expires.
        if (!user) return;

        resolveOnce(user);
      },
      (error) => {
        rejectOnce(error);
      },
    );
  });
}

export async function submitFwrLocation(payload) {
  await waitForAuthenticatedUser();

  const result = await submitLocationCallable(payload);
  return result?.data || null;
}

export async function markFwrMonitoringSignedOut() {
  await waitForAuthenticatedUser();

  const result = await updateStatusCallable({
    monitoringStatus: "SIGNED_OUT",
  });

  return result?.data || null;
}
