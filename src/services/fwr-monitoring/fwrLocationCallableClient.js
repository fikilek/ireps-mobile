// src/services/fwr-monitoring/fwrLocationCallableClient.js

import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";

import { auth, functions } from "../../firebase";

const AUTH_READY_TIMEOUT_MS = 10_000;

const submitLocationCallable = httpsCallable(
  functions,
  "submitFwrLocationCallable",
);

const updateStatusCallable = httpsCallable(
  functions,
  "updateFwrMonitoringStatusCallable",
);

async function waitForAuthenticatedUser() {
  if (auth.currentUser) return auth.currentUser;

  return new Promise((resolve, reject) => {
    let unsubscribe = null;

    const timeoutId = setTimeout(() => {
      if (unsubscribe) unsubscribe();
      reject(
        new Error(
          "Firebase authentication was not restored before the location timeout.",
        ),
      );
    }, AUTH_READY_TIMEOUT_MS);

    unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        clearTimeout(timeoutId);
        if (unsubscribe) unsubscribe();

        if (!user) {
          reject(new Error("No authenticated user is available for GPS upload."));
          return;
        }

        resolve(user);
      },
      (error) => {
        clearTimeout(timeoutId);
        if (unsubscribe) unsubscribe();
        reject(error);
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
