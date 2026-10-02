// The Meter Discovery transaction id, in one place.
//
// Moved out of FormMeterDiscovery so the No Access screen can build the same id. A no access
// from a batch row and a no access on the normal path are both Meter Discovery transactions
// (NA-R003), so they carry the same kind of id - and two builders would have drifted the way
// everything else in this corner of the app drifted.
//
// The id carries the ward and the ERF number, so a transaction can be placed from its id
// alone. An id can never be rewritten, so what goes in it is permanent.

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
