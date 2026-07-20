// src/services/fwr-monitoring/fwrLocationCallableClient.js

import { httpsCallable } from "firebase/functions";

import { functions } from "../../firebase";

const submitLocationCallable = httpsCallable(
  functions,
  "submitFwrLocationCallable",
);

const updateStatusCallable = httpsCallable(
  functions,
  "updateFwrMonitoringStatusCallable",
);

export async function submitFwrLocation(payload) {
  const result = await submitLocationCallable(payload);
  return result?.data || null;
}

export async function markFwrMonitoringSignedOut() {
  const result = await updateStatusCallable({
    monitoringStatus: "SIGNED_OUT",
  });

  return result?.data || null;
}
