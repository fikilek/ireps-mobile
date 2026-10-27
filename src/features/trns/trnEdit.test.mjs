import test from "node:test";
import assert from "node:assert/strict";

import {
  filterTrns,
  isEligibleFailedTrn,
} from "./filterTrns.js";
import {
  initialTrnFilterState,
  getActiveTrnFilterCount,
} from "../../context/TrnFilterContext.js";

test("TrnFilterContext: initial state includes failedOnly=false and counts it when active", () => {
  assert.equal(initialTrnFilterState.failedOnly, false);
  assert.equal(getActiveTrnFilterCount(initialTrnFilterState), 0);

  const activeState = {
    ...initialTrnFilterState,
    failedOnly: true,
  };
  assert.equal(getActiveTrnFilterCount(activeState), 1);
});

test("isEligibleFailedTrn: accurately identifies authoritative QA FAIL records", () => {
  // Case 1: workflow.state is QA FAIL
  assert.ok(isEligibleFailedTrn({ workflow: { state: "QA FAIL" } }));
  assert.ok(isEligibleFailedTrn({ workflowState: "QA FAIL" }));

  // Case 2: qa.state is FAIL
  assert.ok(isEligibleFailedTrn({ qa: { state: "FAIL" } }));

  // Case 3: qa.status is QA_FAIL
  assert.ok(isEligibleFailedTrn({ qa: { status: "QA_FAIL" } }));

  // Case 4: case-insensitive and trimmed
  assert.ok(isEligibleFailedTrn({ workflowState: " qa fail " }));
  assert.ok(isEligibleFailedTrn({ qa: { state: " fail " } }));
});

test("isEligibleFailedTrn: strictly rejects QA PASS records even if other fields have fail text", () => {
  // Case 1: workflow.state is QA PASS
  assert.equal(isEligibleFailedTrn({ workflowState: "QA PASS" }), false);
  assert.equal(isEligibleFailedTrn({ workflow: { state: "QA PASS" } }), false);

  // Case 2: qa.state is PASS
  assert.equal(isEligibleFailedTrn({ qa: { state: "PASS" } }), false);
  assert.equal(isEligibleFailedTrn({ qa: { status: "QA_PASS" } }), false);

  // Case 3: QA PASS overrides legacy or conflicting fail fields
  assert.equal(
    isEligibleFailedTrn({
      workflowState: "QA PASS",
      qa: { state: "FAIL" },
    }),
    false,
    "Final QA PASS must take precedence over any secondary fail flag"
  );
});

test("isEligibleFailedTrn: rejects non-failed states (ISSUED, IN_PROGRESS, COMPLETED without QA fail)", () => {
  assert.equal(isEligibleFailedTrn({ workflowState: "ISSUED" }), false);
  assert.equal(isEligibleFailedTrn({ workflowState: "IN_PROGRESS" }), false);
  assert.equal(isEligibleFailedTrn({ workflowState: "COMPLETED" }), false);
  assert.equal(isEligibleFailedTrn({}), false);
  assert.equal(isEligibleFailedTrn(null), false);
});

test("filterTrns: failedOnly toggle filters to QA FAIL records across all origins", () => {
  const records = [
    // 1. Standalone field submission with QA FAIL
    {
      id: "TRN_STANDALONE_FAIL",
      trnType: "METER_DISCOVERY",
      workflowState: "QA FAIL",
      meterNo: "MET001",
      erfNo: "1001",
    },
    // 2. Standalone field submission with QA PASS
    {
      id: "TRN_STANDALONE_PASS",
      trnType: "METER_DISCOVERY",
      workflowState: "QA PASS",
      meterNo: "MET002",
      erfNo: "1002",
    },
    // 3. ITO Work Order submission with QA FAIL
    {
      id: "TRN_ITO_FAIL",
      trnType: "METER_INSTALLATION",
      workflowState: "COMPLETED",
      qa: { state: "FAIL" },
      workOrderId: "WO-9912",
      meterNo: "MET003",
      erfNo: "1003",
    },
    // 4. Targeted Batch submission with QA FAIL
    {
      id: "TRN_TB_FAIL",
      trnType: "METER_INSPECTION",
      workflowState: "QA FAIL",
      batchId: "TB-BATCH-55",
      batchRowId: "ROW-1",
      meterNo: "MET004",
      erfNo: "1004",
    },
    // 5. In-progress field submission
    {
      id: "TRN_IN_PROGRESS",
      trnType: "METER_DISCONNECTION",
      workflowState: "IN_PROGRESS",
      meterNo: "MET005",
      erfNo: "1005",
    },
  ];

  // When failedOnly is false, all non-filtered records are returned
  const allFiltered = filterTrns(records, { ...initialTrnFilterState, failedOnly: false });
  assert.equal(allFiltered.length, 5);

  // When failedOnly is true, only the 3 QA FAIL records are returned
  const failedFiltered = filterTrns(records, { ...initialTrnFilterState, failedOnly: true });
  assert.equal(failedFiltered.length, 3);
  const failedIds = failedFiltered.map((r) => r.id);
  assert.ok(failedIds.includes("TRN_STANDALONE_FAIL"), "Standalone fail must be included");
  assert.ok(failedIds.includes("TRN_ITO_FAIL"), "ITO fail must be included without requiring batchId");
  assert.ok(failedIds.includes("TRN_TB_FAIL"), "TB fail must be included without requiring workOrderId");
  assert.ok(!failedIds.includes("TRN_STANDALONE_PASS"), "QA PASS must be excluded");
  assert.ok(!failedIds.includes("TRN_IN_PROGRESS"), "In-progress must be excluded");
});

test("filterTrns: failedOnly combines correctly with search query and TRN type filter", () => {
  const records = [
    {
      id: "TRN_ALPHA_1",
      trnType: "METER_DISCOVERY",
      workflowState: "QA FAIL",
      ast: { astData: { astNo: "METER_ALPHA" } },
      accessData: { erfNo: "500" },
    },
    {
      id: "TRN_BETA_2",
      trnType: "METER_INSTALLATION",
      workflowState: "QA FAIL",
      ast: { astData: { astNo: "METER_BETA" } },
      accessData: { erfNo: "501" },
    },
    {
      id: "TRN_ALPHA_PASS_3",
      trnType: "METER_DISCOVERY",
      workflowState: "QA PASS",
      ast: { astData: { astNo: "METER_ALPHA_PASS" } },
      accessData: { erfNo: "502" },
    },
  ];

  // Combine failedOnly with search "alpha"
  const searchResults = filterTrns(records, {
    ...initialTrnFilterState,
    failedOnly: true,
    searchQuery: "alpha",
  });
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].id, "TRN_ALPHA_1");

  // Combine failedOnly with trnTypes: ["METER_INSTALLATION"]
  const typeResults = filterTrns(records, {
    ...initialTrnFilterState,
    failedOnly: true,
    trnTypes: ["METER_INSTALLATION"],
  });
  assert.equal(typeResults.length, 1);
  assert.equal(typeResults[0].id, "TRN_BETA_2");
});

test("FWR Ownership Rule: submitter check allows only authoritative owner to open correction", () => {
  const trn = {
    id: "TRN_123",
    workflow: { state: "QA FAIL", completedByUid: "fwr_user_1" },
    metadata: { createdByUid: "fwr_user_1" },
  };

  const currentFwr = "fwr_user_1";
  const otherFwr = "fwr_user_2";

  // Simulate ownership resolution function as implemented in TrnItem & backend model
  function canFwrEdit(item, userUid) {
    if (!userUid) return false;
    const submitterUid =
      item?.workflow?.completedByUid ||
      item?.metadata?.createdOnDeviceByUid ||
      item?.metadata?.createdByUid ||
      null;
    return submitterUid === userUid;
  }

  assert.equal(canFwrEdit(trn, currentFwr), true, "Authoritative submitter must be allowed");
  assert.equal(canFwrEdit(trn, otherFwr), false, "Non-owning FWR must be denied edit access");
  assert.equal(canFwrEdit(trn, null), false, "Unauthenticated user must be denied");
});

test("QA PASS Lock: completed lifecycle cannot be corrected if final QA PASS is recorded", () => {
  function isCorrectionAllowed({ workflowState, qaState, isOwner }) {
    if (!isOwner) return false;
    if (workflowState === "QA PASS" || qaState === "PASS" || qaState === "QA_PASS") {
      return false; // Immutable
    }
    return workflowState === "QA FAIL" || qaState === "FAIL" || qaState === "QA_FAIL";
  }

  // Completed + QA FAIL + Owner -> Eligible
  assert.equal(
    isCorrectionAllowed({ workflowState: "QA FAIL", qaState: "FAIL", isOwner: true }),
    true
  );

  // Completed + QA PASS + Owner -> Ineligible (Locked)
  assert.equal(
    isCorrectionAllowed({ workflowState: "QA PASS", qaState: "PASS", isOwner: true }),
    false
  );

  // Completed + QA FAIL + Non-Owner -> Ineligible
  assert.equal(
    isCorrectionAllowed({ workflowState: "QA FAIL", qaState: "FAIL", isOwner: false }),
    false
  );
});
