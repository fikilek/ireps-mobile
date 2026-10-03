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

/**
 * NA-R005 (1.10.0) — the No Access transaction id. Agreed by the owner, 3 October 2026.
 *
 *   TRN_NA_{work}_{timestamp}_{meterType}_{wardPcode}_{erfNo}
 *   TRN_NA_MDIS_1791024322663_ELC_ZA5241006_1695
 *   TRN_NA_MDIS_1791024322663_NA_ZA5241006_1695     first visit, no meter reached
 *   TRN_NA_MDCN_1791024322663_ELC_ZA5241006_1695    a disconnection that could not be done
 *
 * Until this rule existed the id was a Meter Discovery id with `NA` in the meter-type slot -
 * a convention in use since 2 May 2026 that nobody had written down, and that the format
 * reference contradicts: it declares only ELC and WTR there. The owner: "who did you agree
 * with on this NA trn ID?" Nobody had.
 *
 * `TRN_NA_` says what it is at a glance. The WORK is kept after it because NA-R003 says a no
 * access on a disconnection IS a disconnection that could not be done - without it every no
 * access would look the same. And the meter type is `NA` where no meter was reached, which is
 * most first-visit Discoveries.
 */
export function buildNoAccessTrnId({ trnType, meterType, wardPcode, erfNo }) {
  const prefix = TRN_PREFIX_BY_TYPE[String(trnType || "").toUpperCase()];
  if (!prefix) throw new Error(`No transaction prefix for ${trnType}`);

  // TRN_MDIS -> MDIS. One table, so a work code can never drift from its prefix.
  const work = prefix.replace(/^TRN_/, "");

  const type = String(meterType || "").toLowerCase();
  const typeCode =
    type === "water" ? "WTR" : type === "electricity" ? "ELC" : "NA";

  const safeWardPcode = String(wardPcode || "NAv")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 12);
  const safeErfNo = String(erfNo || "NAv")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 12);

  return `TRN_NA_${work}_${Date.now()}_${typeCode}_${safeWardPcode}_${safeErfNo}`;
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
