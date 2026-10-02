// The Meter Discovery transaction id, in one place.
//
// Moved out of FormMeterDiscovery so the No Access screen can build the same id. A no access
// from a batch row and a no access on the normal path are both Meter Discovery transactions
// (NA-R003), so they carry the same kind of id - and two builders would have drifted the way
// everything else in this corner of the app drifted.
//
// The id carries the ward and the ERF number, so a transaction can be placed from its id
// alone. An id can never be rewritten, so what goes in it is permanent.

// No Access rules NA-R003 (1.3.0): every transaction type carries its own prefix, and a no
// access is a transaction OF THAT TYPE - a no access on a disconnection is a disconnection
// that could not be done, not a discovery. One table, so the No Access screen cannot invent a
// kind of work the rest of iREPS does not use.
export const TRN_PREFIX_BY_TYPE = Object.freeze({
  METER_DISCOVERY: "TRN_MDIS",
  METER_INSTALLATION: "TRN_MINST",
  METER_INSPECTION: "TRN_MINSP",
  METER_DISCONNECTION: "TRN_MDCN",
  METER_RECONNECTION: "TRN_MRCN",
  METER_REMOVAL: "TRN_MREM",
  METER_READING: "TRN_MREAD",
});

/** The id for a no access on any transaction type, built the way that type builds its own. */
export function buildNoAccessTrnId({ trnType, wardPcode, erfNo }) {
  const prefix = TRN_PREFIX_BY_TYPE[String(trnType || "").toUpperCase()];
  if (!prefix) throw new Error(`No transaction prefix for ${trnType}`);

  const safeWardPcode = String(wardPcode || "NAv").replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
  const safeErfNo = String(erfNo || "NAv").replace(/[^A-Za-z0-9]/g, "").slice(0, 12);

  return `${prefix}_${Date.now()}_NA_${safeWardPcode}_${safeErfNo}`;
}

export function buildMeterDiscoveryTrnId({ wardPcode, erfNo, meterType }) {
  const ts = Date.now();

  const safeWardPcode = String(wardPcode || "NAv")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 12);

  const safeErfNo = String(erfNo || "NAv")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 12);

  const typeCode =
    meterType === "water" ? "WTR" : meterType === "electricity" ? "ELC" : "NA";

  return `TRN_MDIS_${ts}_${typeCode}_${safeWardPcode}_${safeErfNo}`;
}
