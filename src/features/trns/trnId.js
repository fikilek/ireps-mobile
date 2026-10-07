// THE ONE WELL FOR TRANSACTION IDS.
//
// Every transaction id in iREPS is built here and nowhere else. `NA-R005`, and the owner's
// standing rule that a thing used in many screens lives in one place and is never copied into
// one of them — the same rule that put every form's dropdown in `formOptions.js`.
//
//   work done:  TRN_{work}_{milliseconds}_{meterType}_{wardPcode}_{erfNo}
//   no access:  TRN_{work}_{milliseconds}_{meterType}_{wardPcode}_{erfNo}_NA
//
// A no access id is the ordinary id with `_NA` on the end, and nothing else differs (owner,
// 7 October 2026).
//
// WHY THIS MODULE HAD TO EXIST. On 7 October there were TEN places building a transaction id —
// nine of them written inline in the screen that happened to need one. They were not copies of
// one thing; they had drifted into three different shapes:
//
//   - a missing ward became `NAv` on Discovery, Installation and Commissioning, and `WARD` on
//     Disconnection, Reconnection, Removal, Reading and Inspection;
//   - an unknown meter type became `NA` on Installation and Commissioning, `NAv` on the no
//     access builder, and on Inspection it became **ELC** — an unknown meter silently recorded
//     as electricity, in its own id, for ever;
//   - one group stripped punctuation and cut the ward to twelve characters, the other turned
//     punctuation into underscores and cut nothing.
//
// None of that was decided; it accumulated. An id cannot be rewritten, so every one of those
// differences is permanent in the data. One builder makes the shape the only thing that can be
// produced, rather than a convention nine screens have to remember.

/** The prefix each kind of work carries. The work is what the worker went to do. */
export const TRN_PREFIX_BY_TYPE = Object.freeze({
  METER_DISCOVERY: "TRN_MDIS",
  METER_INSTALLATION: "TRN_MINST",
  METER_COMMISSIONING: "TRN_MCOM",
  METER_DISCONNECTION: "TRN_MDCN",
  METER_RECONNECTION: "TRN_MRCN",
  METER_REMOVAL: "TRN_MREM",
  METER_INSPECTION: "TRN_MINSP",
  METER_READING: "TRN_MREAD",
});

/** Last, and only on a no access. A reader sees the work first, then that it failed. */
export const NO_ACCESS_TRN_SUFFIX = "_NA";

/**
 * `ELC`, `WTR`, or `NAv` where nothing knows what kind of meter it is.
 *
 * `NAv` and not a guess: on a first Discovery that ended in no access there is no meter, so
 * there is no kind. Inspection used to answer `ELC` for anything that was not water, which put
 * a wrong fact in an id that can never be corrected.
 */
export function meterTypeCode(meterType) {
  const type = String(meterType || "").trim().toLowerCase();

  if (type === "water") return "WTR";
  if (type === "electricity") return "ELC";

  return "NAv";
}

/**
 * One way of cleaning a part of an id. Letters and digits survive; everything else goes.
 *
 * It does not turn punctuation into underscores, because `_` is what separates the parts of an
 * id — a ward written `ZA 5241` would otherwise add a part and shift everything after it.
 */
function idPart(value, fallback) {
  const cleaned = String(value ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 12);

  return cleaned || fallback;
}

/**
 * Build a transaction id.
 *
 * @param {object} args
 * @param {string} args.trnType      METER_DISCOVERY, METER_DISCONNECTION, and so on.
 * @param {string} [args.meterType]  "electricity" | "water" | anything else, which is `NAv`.
 * @param {string} [args.wardPcode]  The ward. Missing becomes `NAv`.
 * @param {string} [args.erfNo]      The ERF. Missing becomes `NAv`.
 * @param {boolean} [args.noAccess]  True when the worker could not reach the meter.
 * @param {Date} [args.at]           The moment of capture. Defaults to now.
 */
export function buildTrnId({
  trnType,
  meterType,
  wardPcode,
  erfNo,
  noAccess = false,
  at = new Date(),
}) {
  const prefix = TRN_PREFIX_BY_TYPE[String(trnType || "").trim().toUpperCase()];

  if (!prefix) throw new Error(`No transaction prefix for ${trnType}`);

  const id = [
    prefix,
    at.getTime(),
    meterTypeCode(meterType),
    idPart(wardPcode, "NAv"),
    idPart(erfNo, "NAv"),
  ].join("_");

  return noAccess ? id + NO_ACCESS_TRN_SUFFIX : id;
}

/** Does this id say the worker could not reach the meter? The suffix, last. */
export function isNoAccessTrnId(trnId) {
  return String(trnId || "").trim().endsWith(NO_ACCESS_TRN_SUFFIX);
}
