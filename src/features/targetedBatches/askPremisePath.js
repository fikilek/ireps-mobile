import { Alert } from "react-native";

import {
  getMissingTargetedBatchContextFields,
  normalizeTargetedBatchContext,
  serializeTargetedBatchContext,
} from "../premises/targetedBatchPremiseContext.js";
import { runLiveBatchRowCheck } from "./askDiscoveryPath.js";
import {
  BATCH_PREMISE_REASONS,
  erfWithCarriedBatchContext,
  evaluateBatchPremiseOffer,
} from "./targetedBatchContextCarry.js";

function asSentence(text) {
  const clean = String(text || "").trim();
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

// TB-R051: a new premise on an ERF selected with a batch links to that batch
// row, so it is checked live the same way as Discover before the premise form
// opens. Refused: the reason, with a premise on the Normal Path (the batch dropped from
// the selection) or Cancel. An ERF without a batch opens the form at once.
// openPremiseForm({ erfId, targetedBatchContext }) opens the screen's form;
// targetedBatchContext is the serialized batch, or null for a premise on the Normal Path.
export function askPremisePath({
  erf,
  updateGeo,
  openPremiseForm,
  actor,
  onCheckingChange,
}) {
  const erfId = String(erf?.id ?? "").trim();
  if (!erfId) return;

  const carriesBatch = Object.prototype.hasOwnProperty.call(
    erf,
    "targetedBatchContext",
  );

  if (!carriesBatch) {
    openPremiseForm({ erfId, targetedBatchContext: null });
    return;
  }

  // TB-R051: the form reads the batch from the selected ERF, so a Normal Path
  // premise re-selects the plain ERF before the form opens.
  const openNormalPathPremise = () => {
    updateGeo(
      {
        selectedErf: erfWithCarriedBatchContext({
          erf,
          selectedErfContext: null,
        }),
      },
      { silent: true },
    );

    openPremiseForm({ erfId, targetedBatchContext: null });
  };

  // An empty batch key is no batch: drop it and open the form on the Normal Path.
  if (erf.targetedBatchContext == null) {
    openNormalPathPremise();
    return;
  }

  const normalPathButton = {
    text: "Normal Path",
    onPress: openNormalPathPremise,
  };
  const cancelButton = { text: "Cancel", style: "cancel" };

  const ctx = normalizeTargetedBatchContext(erf.targetedBatchContext);
  const serialized = serializeTargetedBatchContext(ctx);
  const missingFields = getMissingTargetedBatchContextFields(ctx);

  if (!ctx || !serialized || missingFields.length > 0) {
    Alert.alert(
      "Batch details incomplete",
      `This ERF is selected for a batch, but the batch details are incomplete${
        missingFields.length > 0 ? ` (${missingFields.join(", ")})` : ""
      }. This premise cannot be added on the Sales Path. Add it on the Normal Path?`,
      [normalPathButton, cancelButton],
    );
    return;
  }

  const batchLine = `Batch ${ctx.tbId} row ${ctx.rowNo ?? "?"} (meter ${
    ctx.targetedMeterNo || "?"
  }).`;

  // TB-R051: the Sales Path is refused with the reason; only the Normal Path or cancel remain.
  const showRefusal = (reason, { checkFailed = false } = {}) => {
    const next = checkFailed
      ? "Try again when connected, or add this premise on the Normal Path?"
      : "This premise cannot be added on the Sales Path. Add it on the Normal Path?";

    Alert.alert(
      "Batch premise",
      `${asSentence(reason)}\n\n${batchLine} ${next}`,
      [normalPathButton, cancelButton],
    );
  };

  // The batch stays on the selection only for its own ERF (fails closed).
  if (ctx.erfId !== erfId) {
    showRefusal(BATCH_PREMISE_REASONS.ERF_MISMATCH);
    return;
  }

  // TB-R051: the batch premise is offered only on the live row of a batch in
  // the worker's work orders, with the Premise button's checks. No silent
  // wait: the caller shows progress for the whole check.
  runLiveBatchRowCheck({
    ctx,
    onCheckingChange,
    onResult: ({ failed, row, batch, team }) => {
      if (failed) {
        showRefusal(BATCH_PREMISE_REASONS.CHECK_FAILED, { checkFailed: true });
        return;
      }

      const decision = evaluateBatchPremiseOffer({
        ctx,
        erf,
        row,
        batch,
        team,
        actor,
      });

      if (decision.offer) {
        // Offered: the form opens exactly as it did before the check.
        openPremiseForm({ erfId, targetedBatchContext: serialized });
        return;
      }

      showRefusal(decision.reason);
    },
  });
}
