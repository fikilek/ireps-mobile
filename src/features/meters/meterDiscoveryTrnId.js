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
 * NA-R005 (1.12.0) — the No Access transaction id. Settled by the owner, 3 October 2026.
 *
 *   TRN_{work}_{YYMMDD}_{HHMMSSmmm}_{rand}_{meterCat}_{wardPcode}_{erfNo}_NA
 *   TRN_MDIS_261003_124522663_K7X_ELC_ZA5241006_1695_NA
 *
 * Until this rule existed the id was a Meter Discovery id with `NA` in the METER-TYPE slot and
 * an epoch number for the time - a convention in use since 2 May 2026 that nobody had written
 * down, and that the format reference contradicts. The owner: "who did you agree with on this
 * NA trn ID?" Nobody had. I carried it into this function on 2 October without asking.
 *
 * THE TIME IS SAST AND IT IS READABLE. 1791024322663 is a date, but only a machine can see
 * that. An id is read by people, so it says what the worker's own clock said: 261003_124522 is
 * 3 October 2026 at 12:45:22. The record's own timestamps stay UTC; this is the one place that
 * is deliberately local, because it is the one place a person reads a time without a label.
 *
 * MILLISECONDS AND A TAIL. Seconds alone would let a double tap produce the SAME id, and a
 * repeated id is how a visit silently overwrote another this morning. Milliseconds close that
 * for one phone; the three-character tail closes it for two phones in the same millisecond.
 *
 * `_NA` is a SUFFIX, last, so a reader sees the work first and then that it failed. It is never
 * the meter category - conflating the two is how NA came to sit in a slot meaning "which kind
 * of meter".
 */
export const NO_ACCESS_TRN_SUFFIX = "_NA";

// SAST is UTC+2 and does not observe daylight saving. The same constant the appointment maths
// uses, so an id and an appointment can never disagree about what time it is here.
const SAST_OFFSET_MINUTES = 120;

const TAIL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** ELC, WTR, or NAv where no meter was reached (NA-R005). */
export function meterCategoryCode(meterType) {
  const type = String(meterType || "").toLowerCase();
  if (type === "water") return "WTR";
  if (type === "electricity") return "ELC";
  return "NAv";
}

/** YYMMDD_HHMMSSmmm in SAST, which is what the worker's phone was showing. */
export function sastStamp(at = new Date()) {
  const sast = new Date(at.getTime() + SAST_OFFSET_MINUTES * 60 * 1000);
  const pad = (value, width) => String(value).padStart(width, "0");

  const date =
    pad(sast.getUTCFullYear() % 100, 2) +
    pad(sast.getUTCMonth() + 1, 2) +
    pad(sast.getUTCDate(), 2);

  const time =
    pad(sast.getUTCHours(), 2) +
    pad(sast.getUTCMinutes(), 2) +
    pad(sast.getUTCSeconds(), 2) +
    pad(sast.getUTCMilliseconds(), 3);

  return `${date}_${time}`;
}

/**
 * Three characters, so two phones capturing in the same millisecond cannot write the same id.
 * I, O, 0 and 1 are left out: an id is read aloud and copied by hand.
 */
export function idTail(length = 3) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += TAIL_ALPHABET[Math.floor(Math.random() * TAIL_ALPHABET.length)];
  }
  return out;
}

export function buildNoAccessTrnId({
  trnType,
  meterType,
  wardPcode,
  erfNo,
  at = new Date(),
}) {
  const prefix = TRN_PREFIX_BY_TYPE[String(trnType || "").toUpperCase()];
  if (!prefix) throw new Error(`No transaction prefix for ${trnType}`);

  const safeWardPcode = String(wardPcode || "NAv")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 12);
  const safeErfNo = String(erfNo || "NAv")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 12);

  return (
    [
      prefix.replace(/_$/, ""),
      sastStamp(at),
      idTail(),
      meterCategoryCode(meterType),
      safeWardPcode,
      safeErfNo,
    ].join("_") + NO_ACCESS_TRN_SUFFIX
  );
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
