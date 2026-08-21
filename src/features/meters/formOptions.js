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

  anomalies: Object.freeze([
    Object.freeze({
      anomaly: "Meter Ok",
      anomalyDetails: Object.freeze(["Operationally Ok"]),
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

  norm_actions: Object.freeze([
    option("None", "none"),
    option("Issue Fine"),
    option("Meter Removal"),
    option("Meter Disconnection"),
    option("Meter Reconnection"),
    option("Meter Damaged - New Meter Installed"),
    option("Meter Faulty - New Meter Installed"),
    option("Meter Illegal Connected - Tamper Removed"),
    option("Meter Illegal Connected - New Meter Installed"),
    option("Meter Bridged (By Munic) - New Meter Installed"),
    option("Meter Blocked (By Munic) - New Meter Installed"),
    option("Meter Reconnected"),
    option("Keypad - Normalised"),
    option("Completed Service Points (Cable Installed)"),
    option("Meter Registered"),
    option("Meter Missing Installed"),
  ]),
});

export function getFormOptions(name) {
  return FORM_OPTIONS[name] || [];
}

export function getFormOptionValues(name) {
  return getFormOptions(name)
    .map((entry) => {
      if (typeof entry === "string") return entry;
      return entry?.value;
    })
    .filter((value) => value !== undefined && value !== null && value !== "");
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
