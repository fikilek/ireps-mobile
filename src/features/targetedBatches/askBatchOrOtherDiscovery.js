import { doc, getDoc } from "firebase/firestore";
import { Alert, Platform, ToastAndroid } from "react-native";

import { db } from "../../firebase";
import {
  enrichTargetedBatchRowFromSales,
  normalizeTargetedBatchRow,
} from "../../redux/targetedBatchApi";
import {
  getMissingTargetedBatchContextFields,
  serializeTargetedBatchContext,
} from "../premises/targetedBatchPremiseContext.js";
import {
  BATCH_DISCOVERY_REASONS,
  erfWithCarriedBatchContext,
  evaluateBatchDiscoveryOffer,
  getBatchAllocationTarget,
  getPremiseBatchErfId,
  premiseTargetedBatchContext,
} from "./targetedBatchContextCarry.js";

// A worker never sees an internal code. Everything here is logged with console.log, not console.error:
// an error log paints a red box across the field worker's screen, and the window beside it has already
// said the same thing in words they can act on (owner, 2026-09-24: "can you remove the error?").
// TB-R051: the live row check gives up after 10 seconds.
const LIVE_BATCH_ROW_TIMEOUT_MS = 10000;

// TB-R051: said when a batch check is asked for while another is still running.
export const STILL_CHECKING_MESSAGE = "Still checking the previous premise";

// One check at a time, so a second tap does not stack a second Alert.
let liveBatchRowCheckInFlight = false;

function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("TARGETED_BATCH_ROW_CHECK_TIMEOUT")),
      ms,
    );
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// TB-R051: one-off read of the live row and its Sales record, joined the same
// way as the My Work Orders rows stream, with the parent batch (tb_uploads)
// and, for a TEAM allocation, that team. Throws when the row, the batch or the
// team cannot be read.
async function readLiveBatchRow(ctx) {
  const [rowResult, salesResult, batchResult] = await Promise.allSettled([
    getDoc(doc(db, "tb_rows", ctx.rowId)),
    getDoc(doc(db, "sales-all-meters", ctx.salesDocId)),
    getDoc(doc(db, "tb_uploads", ctx.tbId)),
  ]);

  if (rowResult.status === "rejected") throw rowResult.reason;
  if (batchResult.status === "rejected") throw batchResult.reason;

  const batchSnap = batchResult.value;
  const batch = batchSnap.exists()
    ? { id: batchSnap.id, ...(batchSnap.data() || {}) }
    : null;

  let team = null;
  const target = getBatchAllocationTarget(batch);
  if (target.type === "TEAM" && target.id) {
    const teamSnap = await getDoc(doc(db, "teams", target.id));
    team = teamSnap.exists()
      ? { id: teamSnap.id, ...(teamSnap.data() || {}) }
      : null;
  }

  const rowSnap = rowResult.value;
  if (!rowSnap.exists()) return { row: null, batch, team };

  const rowDoc = { id: rowSnap.id, ...(rowSnap.data() || {}) };
  const rowSalesDocId = String(rowDoc.salesAllMeterId ?? "").trim();

  let sales = null;
  let salesLoadState = "MISSING";
  if (salesResult.status === "rejected") {
    salesLoadState = "ERROR";
    console.log("[TARGETED_BATCH_DISCOVER_SALES_CHECK_ERROR]", {
      salesDocId: ctx.salesDocId,
      error: salesResult.reason,
    });
  } else if (
    salesResult.value.exists() &&
    rowSalesDocId &&
    rowSalesDocId === ctx.salesDocId
  ) {
    // Only the row's own Sales record counts as loaded.
    sales = salesResult.value.data() || {};
    salesLoadState = "LOADED";
  }

  const row = normalizeTargetedBatchRow(
    enrichTargetedBatchRowFromSales(rowDoc, sales, salesLoadState),
  );

  return { row, batch, team };
}

function setChecking(onCheckingChange, checking) {
  if (typeof onCheckingChange !== "function") return;

  try {
    onCheckingChange(checking);
  } catch (error) {
    console.log("[TARGETED_BATCH_CHECK_PROGRESS_ERROR]", error);
  }
}

// TB-R051: a tap during a running check is answered, never dropped silently.
function showStillChecking() {
  if (Platform.OS === "android") {
    ToastAndroid.show(`${STILL_CHECKING_MESSAGE}…`, ToastAndroid.SHORT);
    return;
  }

  Alert.alert("Batch meter", `${STILL_CHECKING_MESSAGE}.`);
}

// TB-R051: runs the live batch check, one at a time. The caller shows its
// progress for the whole check through onCheckingChange(true/false), started
// only once this check is admitted. onResult receives
// { failed, row, batch, team } after the progress is cleared.
// Returns false when another check is still running.
export function runLiveBatchRowCheck({ ctx, onCheckingChange, onResult }) {
  if (liveBatchRowCheckInFlight) {
    showStillChecking();
    return false;
  }

  liveBatchRowCheckInFlight = true;
  setChecking(onCheckingChange, true);

  withTimeout(readLiveBatchRow(ctx), LIVE_BATCH_ROW_TIMEOUT_MS)
    .then(
      ({ row, batch, team }) => ({ failed: false, row, batch, team }),
      (error) => {
        console.log("[TARGETED_BATCH_LIVE_ROW_CHECK_ERROR]", {
          tbId: ctx?.tbId,
          rowId: ctx?.rowId,
          error,
        });
        return { failed: true, row: null, batch: null, team: null };
      },
    )
    .then((result) => {
      liveBatchRowCheckInFlight = false;
      setChecking(onCheckingChange, false);
      onResult(result);
    })
    .catch((error) => {
      console.log("[TARGETED_BATCH_LIVE_ROW_RESULT_ERROR]", error);
    });

  return true;
}

function asSentence(text) {
  const clean = String(text || "").trim();
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

// TB-R051: Discover on a premise linked to a Sales batch row asks whether the
// work is the batch meter or other work. Other work drops the batch.
export function askBatchOrOtherDiscovery({
  premise,
  parentErf,
  selectedErfContext,
  updateGeo,
  router,
  openMissionDiscovery,
  actor,
  onCheckingChange,
}) {
  const ctx = premiseTargetedBatchContext({ premise, selectedErfContext });

  const openOtherWork = () => {
    updateGeo({
      selectedErf: erfWithCarriedBatchContext({
        erf: parentErf,
        selectedErfContext: null,
      }),
      selectedPremise: premise,
      lastSelectionType: "PREMISE",
    });

    openMissionDiscovery({
      premiseId: premise?.id,
      premise,
    });
  };

  if (!ctx) {
    updateGeo({
      selectedErf: erfWithCarriedBatchContext({
        erf: parentErf,
        selectedErfContext,
      }),
      selectedPremise: premise,
      lastSelectionType: "PREMISE",
    });

    openMissionDiscovery({
      premiseId: premise?.id,
      premise,
    });
    return;
  }

  const otherWorkButton = {
    text: "Other work (not the batch)",
    onPress: openOtherWork,
  };
  const cancelButton = { text: "Cancel", style: "cancel" };

  const serialized = serializeTargetedBatchContext(ctx);
  const missingFields = getMissingTargetedBatchContextFields(ctx);

  if (!serialized || missingFields.length > 0) {
    Alert.alert(
      "Batch details incomplete",
      `This premise is linked to a batch, but the batch details are incomplete${
        missingFields.length > 0 ? ` (${missingFields.join(", ")})` : ""
      }. The batch meter cannot be discovered from here. Do other work that is not for the batch?`,
      [otherWorkButton, cancelButton],
    );
    return;
  }

  const batchLine = `Batch ${ctx.tbId} row ${ctx.rowNo ?? "?"} (meter ${
    ctx.targetedMeterNo || "?"
  }).`;

  // TB-R051: the batch option is refused with the reason; only other work or cancel remain.
  const showRefusal = (reason, { openAst = false, checkFailed = false } = {}) => {
    const next = checkFailed
      ? "Try again when connected, or do other work that is not for the batch?"
      : openAst
        ? "Do other work that is not for the batch?"
        : "The batch meter cannot be discovered from here. Do other work that is not for the batch?";

    Alert.alert(
      "Batch meter",
      `${asSentence(reason)}\n\n${batchLine} ${next}`,
      [otherWorkButton, cancelButton],
    );
  };

  // Same check as the Meter button: the premise must be on the row's ERF (fails closed when empty).
  const premiseErfId = getPremiseBatchErfId(premise);
  if (!premiseErfId || premiseErfId !== ctx.erfId) {
    showRefusal(
      premiseErfId
        ? BATCH_DISCOVERY_REASONS.PREMISE_ERF_MISMATCH
        : BATCH_DISCOVERY_REASONS.PREMISE_ERF_MISSING,
    );
    return;
  }

  const offerBatchMeter = () => {
    Alert.alert(
      "Batch meter",
      `This premise belongs to batch ${ctx.tbId} row ${
        ctx.rowNo ?? "?"
      } (meter ${
        ctx.targetedMeterNo || "?"
      }). Discover the batch meter, or do other work that is not for the batch?`,
      [
        {
          text: "Discover batch meter",
          onPress: () => {
            updateGeo({
              selectedErf: parentErf
                ? { ...parentErf, targetedBatchContext: ctx }
                : null,
              selectedPremise: premise,
              lastSelectionType: "PREMISE",
            });

            // TB-R051: same route and params as the My Work Orders Meter tile.
            router.push({
              pathname: "/(tabs)/premises/form",
              params: {
                premiseId: premise.id,
                action: JSON.stringify({
                  access: "yes",
                  meterType: "electricity",
                }),
                targetedBatchContext: serialized,
              },
            });
          },
        },
        otherWorkButton,
        cancelButton,
      ],
    );
  };

  // TB-R051: the batch option is offered only on the live row of a batch in
  // the worker's work orders, with the Meter button's checks. No silent wait:
  // the caller shows progress for the whole check.
  runLiveBatchRowCheck({
    ctx,
    onCheckingChange,
    onResult: ({ failed, row, batch, team }) => {
      if (failed) {
        showRefusal(BATCH_DISCOVERY_REASONS.CHECK_FAILED, {
          checkFailed: true,
        });
        return;
      }

      const decision = evaluateBatchDiscoveryOffer({
        ctx,
        premise,
        row,
        batch,
        team,
        actor,
      });
      if (decision.offer) {
        offerBatchMeter();
        return;
      }

      showRefusal(decision.reason, { openAst: decision.openAst });
    },
  });
}
