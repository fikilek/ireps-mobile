// TB-R051 (1.3.42): a Completed meter with no meter linked to its batch row was found outside this batch. It is
// looked up by its meter number; these pure helpers describe what was found and decide what the phone does.

const clean = (value) => String(value ?? "").trim();

// The Ward number from a Ward code, as the ASTs screen shows it: ZA7423013 → "13".
export function wardNumberFromPcode(wardPcode) {
  const number = parseInt(clean(wardPcode).slice(-3), 10);
  return Number.isNaN(number) ? "" : String(number);
}

// One meter record (asts document) as the phone needs it.
export function describeFoundMeter(id, data = {}) {
  return {
    id: clean(data?.ast?.astData?.astId) || clean(id),
    meterNo: clean(data?.ast?.astData?.astNo),
    lmPcode: clean(data?.accessData?.parents?.lmPcode),
    wardPcode: clean(data?.accessData?.parents?.wardPcode),
    // Meter records carry the Ward code only; the message names the Ward by its number.
    wardName: wardNumberFromPcode(data?.accessData?.parents?.wardPcode),
    premiseId: clean(data?.accessData?.premise?.id || data?.accessData?.premiseId),
    erfId: clean(data?.accessData?.erfId),
    erfNo: clean(data?.accessData?.erfNo),
  };
}

// What the phone does with the meter records found for a number, for a batch in this LM and Ward:
// - OPEN: one record is in the batch's Ward (the first when several are);
// - ELSEWHERE: records exist, none in the batch's Ward (where names the first one's Ward);
// - NONE: no meter record has this number.
export function chooseFoundMeter(found = [], { lmPcode, wardPcode } = {}) {
  const list = (Array.isArray(found) ? found : []).filter((item) => item?.id);
  if (!list.length) return { outcome: "NONE" };

  const inWard = list.find(
    (item) => item.lmPcode === clean(lmPcode) && item.wardPcode === clean(wardPcode),
  );
  if (inWard) return { outcome: "OPEN", meter: inWard };

  return { outcome: "ELSEWHERE", meter: list[0] };
}

// The message for a meter that cannot be opened from this batch.
export function foundMeterMessage({ outcome, meter } = {}, meterNo) {
  const number = clean(meterNo) || "this meter";
  if (outcome === "ELSEWHERE") {
    const where = clean(meter?.wardName) || clean(meter?.wardPcode);
    const erf = clean(meter?.erfNo);
    return `Meter ${number} was found outside this batch${where ? `, in Ward ${where}` : ""}${
      erf ? ` on ERF ${erf}` : ""
    }. Open it from the ASTs tab in that Ward.`;
  }
  return `Meter ${number} is Completed: it was found outside this batch, but no meter record with this number is on the system.`;
}
