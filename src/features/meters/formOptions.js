const option = (label, value = label) => Object.freeze({ label, value });
const evidenceOption = (label, photoRequired, value = label) =>
  Object.freeze({ label, value, photoRequired });

const FORM_OPTIONS = Object.freeze({
  elec_manufacturers: Object.freeze([
    "Conlog",
    "Landis+gyr",
    "Cashpower",
    "Hexing",
    "Powercom",
    "Itron",
    "Other",
  ]),

  water_manufacturers: Object.freeze([
    "Conlog",
    "Sensus",
    "Elster Kent",
    "Itron",
    "Kamstrup",
    "Lesira Teq",
    "Aqua Loc",
    "Reonet",
    "Other",
  ]),

  meter_phases: Object.freeze([
    option("Single", "single"),
    option("Three", "three"),
  ]),

  meter_types: Object.freeze([
    option("Prepaid", "prepaid"),
    option("Conventional", "conventional"),
  ]),

  meter_categories: Object.freeze(["Normal", "Bulk"]),

  placements: Object.freeze([
    "Kiosk",
    "Pole Top",
    "Pole Bottom",
    "Boundary Wall",
    "Meter Room",
    "Wall Indoors",
    "Inside Property",
    "Other",
  ]),

  meter_statuses: Object.freeze([
    option("Connected", "CONNECTED"),
    option("Disconnected", "DISCONNECTED"),
  ]),

  off_grid_supply: Object.freeze([
    option("Yes", "yes"),
    option("No", "no"),
  ]),

  seal_number_comment_reasons: Object.freeze([
    evidenceOption("Seal Missing", false),
    evidenceOption("Seal Broken", true),
    evidenceOption("Seal Damaged", true),
    evidenceOption("Seal Number Not Visible", true),
    evidenceOption("Seal Number Unreadable", true),
    evidenceOption("Seal Removed", false),
    evidenceOption("Meter Not Sealed", true),
    evidenceOption("Other", false),
  ]),

  keypad_serial_number_comment_reasons: Object.freeze([
    evidenceOption("Keypad Missing", false),
    evidenceOption("Keypad Not Installed", false),
    evidenceOption("Keypad Integrated With Meter", true),
    evidenceOption("Keypad Serial Number Not Visible", true),
    evidenceOption("Keypad Serial Number Unreadable", true),
    evidenceOption("Keypad Damaged", true),
    evidenceOption("Keypad Inaccessible", false),
    evidenceOption("Other", false),
  ]),

  cb_comment_reasons: Object.freeze([
    evidenceOption("Circuit Breaker Missing", false),
    evidenceOption("Circuit Breaker Size Not Visible", true),
    evidenceOption("Circuit Breaker Size Unreadable", true),
    evidenceOption("Circuit Breaker Damaged", true),
    evidenceOption("Circuit Breaker Inaccessible", false),
    evidenceOption("No Dedicated Circuit Breaker", false),
    evidenceOption("Distribution Board Inaccessible", false),
    evidenceOption("Other", false),
  ]),

  remaining_credit_comment_reasons: Object.freeze([
    "Display blank / no reading",
    "Display damaged",
    "Display unreadable",
    "Unable to obtain balance",
    "Meter not responding",
    "Other",
  ]),

  anomalies: Object.freeze([
    Object.freeze({
      // Meter Ok carries three details: the meter works, but it may still be
      // interfered with. The two suspicions need an anomaly photo (see
      // anomalyPhotoRequired) — a suspicion without a picture proves nothing.
      anomaly: "Meter Ok",
      anomalyDetails: Object.freeze([
        "Operationally Ok",
        "Bridge Suspicion",
        "Bypass Suspicion",
      ]),
    }),
    Object.freeze({
      anomaly: "Meter Faulty",
      anomalyDetails: Object.freeze([
        "Not Accepting Sgc Tokens",
        "Meter Display Blank",
        "Negative Credit Units",
        "Zero Reading - Conventional Meter",
        "Meter Wheel Not Moving",
        "Meter Wheel Running In Reverse",
      ]),
    }),
    Object.freeze({
      anomaly: "Meter Damaged",
      anomalyDetails: Object.freeze([
        "Meter Number Not Clearly Visible",
        "Meter Burnt",
        "Meter Button(s) Not Working",
        "Meter Broken",
      ]),
    }),
    Object.freeze({
      anomaly: "Illegally Connected",
      anomalyDetails: Object.freeze([
        "Straight Connection (Meter Bypassed)",
        "Bridge Wire On The Meter",
      ]),
    }),
  ]),

  other_anomalies: Object.freeze([
    "Meter Blocked (By Munic)",
    "Meter Bridged (By Munic)",
    "Incomplete Service Points",
    "Meter Not Registered",
    "Keypad Faulty",
  ]),

  // MN-R001: one list for Meter Discovery and Meter Inspection. What is offered
  // depends on the anomaly — see getNormalisationOptions below.
  norm_actions: Object.freeze([
    option("None", "none"),
    option("Disconnect meter"),
    option("Replace meter"),
    option("Tamper removed"),
    option("Keypad normalised"),
    option("Service point completed"),
    option("Meter registered"),
  ]),

  no_action_reasons: Object.freeze([
    "Threatened or chased away",
    "Customer refused",
    "Unsafe to work on",
    "Meter could not be reached",
    "No meter available to replace",
    "Office said to leave it",
    "Other",
  ]),

  // UI-R003: these lists used to come from the server (irepsSelectLookups).
  // Same words and codes as the server held on 22 Sep 2026, so saved data does
  // not change.
  // The meter lifecycle states, so a form can show the state the record holds.
  // A worker only ever chooses Connected or Disconnected (meter_statuses).
  meter_lifecycle_states: Object.freeze([
    option("Field", "FIELD"),
    option("Connected", "CONNECTED"),
    option("Disconnected", "DISCONNECTED"),
    option("Removed", "REMOVED"),
    option("Decommissioned", "DECOMMISSIONED"),
  ]),

  no_reading_reasons: Object.freeze([
    option("Customer refused access", "CUSTOMER_REFUSED_ACCESS"),
    option("Display blank", "DISPLAY_BLANK"),
    option("Display damaged", "DISPLAY_DAMAGED"),
    option("Display not working", "DISPLAY_NOT_WORKING"),
    option("Meter box locked", "METER_BOX_LOCKED"),
    option("Meter not accessible", "METER_NOT_ACCESABLE"),
    option("Meter removed or missing", "METER_REMOVED_OR_MISSING"),
    option("No access to premises", "NO_ACCESS_TO_PREMISES"),
  ]),

  removal_instructions: Object.freeze([
    option("Meter remove decommission", "METER_REMOVE_DECOMMISION"),
  ]),

  meter_reading_instructions: Object.freeze([
    option("Monthly Meter Reading", "MONTHLY_METER_READING"),
    option("Routine Meter Reading", "ROUTINE_METER_READING"),
    option("Verify Meter Reading", "VERIFY_METER_READING"),
    option("Final Meter Reading", "FINAL_METER_READING"),
    option("Investigation Meter Reading", "INVESTIGATION_METER_READING"),
    option("Bulk Meter Reading", "BULK_METER_READING"),
  ]),
});

export function getFormOptions(name) {
  return FORM_OPTIONS[name] || [];
}

// UI-R003: a local list in the shape the forms used to get from the server
// (useIrepsLookupOptions), so a dropdown never waits for the network. The
// select adds its own Other when allowOther is on, so a list's "Other" entry is
// left out here.
export function getLocalSelectLookup(name, { allowOther = true } = {}) {
  const options = getFormOptions(name)
    .map((entry) =>
      typeof entry === "string"
        ? { code: entry, label: entry }
        : { code: String(entry?.value ?? ""), label: String(entry?.label ?? "") },
    )
    .filter((entry) => entry.code && entry.label !== "Other");

  return Object.freeze({
    options: Object.freeze(options),
    allowOther,
    otherCode: "OTHER",
    otherLabel: "Other",
    isLoading: false,
    isFetching: false,
    loading: false,
  });
}

// The manufacturer list for a meter type, as Meter Discovery offers it.
export function getManufacturerListName(meterType) {
  return String(meterType || "").trim().toLowerCase() === "water"
    ? "water_manufacturers"
    : "elec_manufacturers";
}

export function getFormOptionValues(name) {
  return getFormOptions(name)
    .map((entry) => {
      if (typeof entry === "string") return entry;
      return entry?.value;
    })
    .filter((value) => value !== undefined && value !== null && value !== "");
}

// The anomaly details that need no photo. Everything else does — including the
// Meter Ok suspicions. The server keeps the same list in
// functions/meterDiscovery/validation.js; the two must agree or a submission
// that passes on the phone is refused at the back.
export const ANOMALY_DETAILS_WITHOUT_PHOTO = Object.freeze(["Operationally Ok"]);

// A Meter Ok carrying a suspicion is not a healthy meter: it reads amber, not
// the green tick, wherever an anomaly is shown.
export const METER_OK_SUSPICION_DETAILS = Object.freeze([
  "Bridge Suspicion",
  "Bypass Suspicion",
]);

export function anomalyTone(anomaly, anomalyDetail) {
  const name = String(anomaly || "").trim();
  if (name !== "Meter Ok") return name ? "alert" : "ok";
  return METER_OK_SUSPICION_DETAILS.includes(String(anomalyDetail || "").trim())
    ? "suspicion"
    : "ok";
}

export function anomalyPhotoRequired(anomaly, anomalyDetail) {
  const name = String(anomaly || "").trim();
  if (!name) return false;

  const detail = String(anomalyDetail || "").trim();
  // No detail: keep the old anomaly-only rule, so a queued or legacy
  // submission captured before this change is not refused for want of a photo.
  if (!detail) return name !== "Meter Ok";

  return !ANOMALY_DETAILS_WITHOUT_PHOTO.includes(detail);
}

// ── MN-R001: the anomaly decides what follows ─────────────────────────────────
// The back end keeps the same rules in ireps-web/functions/meterDiscovery/
// validation.js and functions/meterLifecycle/helpers.js. The three must agree, or
// a capture that passes on the phone is refused on arrival.

export const NORMALISATION_NONE = "none";

// Fixes done on the spot. Offered whatever the finding, including Meter Ok.
export const NORMALISATION_ON_SITE_FIXES = Object.freeze([
  "Tamper removed",
  "Keypad normalised",
  "Service point completed",
  "Meter registered",
]);

// The action that follows each finding. Not ticking it needs a reason.
const NORMALISATION_EXPECTED_BY_ANOMALY = Object.freeze({
  "Illegally Connected": "Disconnect meter",
  "Meter Damaged": "Replace meter",
  "Meter Faulty": "Replace meter",
});

// The two jobs. Each opens its own chain of forms (MN-R001 section 6), so a
// finding carries one of them, never both.
export const NORMALISATION_JOB_ACTIONS = Object.freeze([
  "Disconnect meter",
  "Replace meter",
]);

export const NORMALISATION_ACTION_VALUES = Object.freeze([
  NORMALISATION_NONE,
  ...NORMALISATION_JOB_ACTIONS,
  ...NORMALISATION_ON_SITE_FIXES,
]);

export const NO_ACTION_REASONS = getFormOptions("no_action_reasons");
export const NO_ACTION_REASON_OTHER = "Other";

export function isMeterOk(anomaly) {
  return String(anomaly || "").trim() === "Meter Ok";
}

// Normalisation is only asked of a finding that has been made.
export function isNormalisationRequired(anomaly) {
  const name = String(anomaly || "").trim();
  return !!name && !isMeterOk(name);
}

export function getExpectedNormalisationAction(anomaly) {
  return NORMALISATION_EXPECTED_BY_ANOMALY[String(anomaly || "").trim()] || "";
}

// None disappears as soon as the finding is not Meter Ok.
export function getNormalisationOptions(anomaly) {
  if (!isNormalisationRequired(anomaly)) {
    return [
      { label: "None", value: NORMALISATION_NONE },
      ...NORMALISATION_ON_SITE_FIXES.map((value) => ({ label: value, value })),
    ];
  }

  return [
    ...NORMALISATION_JOB_ACTIONS.map((value) => ({ label: value, value })),
    ...NORMALISATION_ON_SITE_FIXES.map((value) => ({ label: value, value })),
  ];
}

export function normalisationActionsTaken(actionTaken) {
  const actions = Array.isArray(actionTaken) ? actionTaken : [];
  return actions.filter((action) => String(action) !== NORMALISATION_NONE);
}

// A photo proves work that leaves a mark here. A disconnection or a replacement
// proves itself in the forms that follow, so it is not asked for twice.
export function normalisationPhotoRequired(actionTaken) {
  return normalisationActionsTaken(actionTaken).some(
    (action) => !NORMALISATION_JOB_ACTIONS.includes(action),
  );
}

export function isNoActionReasonRequired({ anomaly, actionTaken }) {
  if (!isNormalisationRequired(anomaly)) return false;

  const expected = getExpectedNormalisationAction(anomaly);
  if (!expected) return false;

  return !normalisationActionsTaken(actionTaken).includes(expected);
}

// One place that says what is wrong, so the phone and the back end say the same.
export function getNormalisationValidationError({
  anomaly,
  actionTaken,
  noActionReason,
  noActionReasonOther,
}) {
  const actions = Array.isArray(actionTaken) ? actionTaken.map(String) : [];

  if (actions.some((action) => !NORMALISATION_ACTION_VALUES.includes(action))) {
    return { path: "actionTaken", message: "This action is not on the list." };
  }

  if (new Set(actions).size !== actions.length) {
    return {
      path: "actionTaken",
      message: "The same action cannot be chosen twice.",
    };
  }

  if (actions.includes(NORMALISATION_NONE) && actions.length !== 1) {
    return {
      path: "actionTaken",
      message: "None cannot be used with another action.",
    };
  }

  if (NORMALISATION_JOB_ACTIONS.every((job) => actions.includes(job))) {
    return {
      path: "actionTaken",
      message: "Choose one: disconnect or replace.",
    };
  }

  if (!isNormalisationRequired(anomaly)) return null;

  if (!isNoActionReasonRequired({ anomaly, actionTaken: actions })) return null;

  const reason = String(noActionReason || "").trim();

  if (!reason) {
    const expected = getExpectedNormalisationAction(anomaly);
    return {
      path: "noActionReason",
      message:
        expected === "Disconnect meter"
          ? "Say why the meter was not disconnected."
          : "Say why the meter was not replaced.",
    };
  }

  if (!NO_ACTION_REASONS.includes(reason)) {
    return { path: "noActionReason", message: "This reason is not on the list." };
  }

  if (
    reason === NO_ACTION_REASON_OTHER &&
    !String(noActionReasonOther || "").trim()
  ) {
    return { path: "noActionReasonOther", message: "Type the reason." };
  }

  return null;
}

export function isFormOptionPhotoRequired(name, value) {
  const optionEntry = getFormOptions(name).find((entry) => {
    const entryValue = typeof entry === "string" ? entry : entry?.value;
    return entryValue === value;
  });

  return !!(
    optionEntry &&
    typeof optionEntry === "object" &&
    optionEntry.photoRequired === true
  );
}
