// Targeted Batch rules TB-R067 (1.3.73): a batch row and its premise.
//
// One commercial ERF holds many businesses: one address, one ERF, a Sales meter and a row for each shop.
// Pressing Premise on a row used to go straight to the ERF's premises, so the second row had no way to say
// which premise was its own, and a premise duplicated on the premise screen belonged to no row at all
// (owner, 2026-09-24, ERF 689: "none of them link up to my work orders").
//
// This is what the choice on the row is made of. iREPS never matches a premise to a row by address, name or
// anything else: at one address with thirteen businesses a wrong join is worse than none, so the worker,
// who is standing in the shop, picks (TB-R067 2).
const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();

// TB-R067 8: a business is asked for its business name, a flat for its unit name.
export const BUSINESS_NAME_TYPES = Object.freeze(["Commercial", "Industrial"]);
const BUSINESS_NAME_TYPE_SET = new Set(BUSINESS_NAME_TYPES.map(upper));

export function premiseNameLabel(propertyType) {
  return BUSINESS_NAME_TYPE_SET.has(upper(propertyType))
    ? "Business Name"
    : "Unit Name";
}

export function premiseId(premise = {}) {
  return clean(
    premise?.id || premise?.premiseId || premise?.accessData?.premise?.id,
  );
}

export function premiseErfId(premise = {}) {
  return clean(
    premise?.erfId ||
      premise?.accessData?.erfId ||
      premise?.refs?.erfId ||
      premise?.parent?.erfId,
  );
}

function premiseType(premise = {}) {
  return clean(premise?.propertyType?.type || premise?.propertyType);
}

// What a premise knows about itself, and nothing else: its unit name and its unit number (TB-R067 1).
export function premiseTitle(premise = {}) {
  const name = clean(premise?.propertyType?.name);
  const unitNo = clean(premise?.propertyType?.unitNo);
  const parts = [];

  if (name) parts.push(name);
  if (unitNo) parts.push(`No ${unitNo}`);

  return parts.join(" · ") || premiseId(premise) || "Premise";
}

// TB-R067 (1.3.73): what the worker reads on the work order card. At a commercial ERF every row carries the
// same street address, so the address alone says nothing about which shop this is. Once the row has its
// premise, the shop's name and its unit number are read beside the address: "26 OLDACRE ST, Thisa Fish and
// Chips, 4" (owner, 2026-09-24). Until then it is the address on its own, as before.
export function rowAddressLine({ address = "", premise = null } = {}) {
  const parts = [clean(address)];
  const name = clean(premise?.propertyType?.name);
  const unitNo = clean(premise?.propertyType?.unitNo);

  if (name) parts.push(name);
  if (unitNo) parts.push(unitNo);

  return parts.filter(Boolean).join(", ");
}

// The row a premise is joined to, if any, and the meter that row was sent for.
function joinedRow(id, rows = []) {
  return (Array.isArray(rows) ? rows : []).find(
    (row) => clean(row?.refs?.premiseId) === id,
  );
}

// The row a premise says it belongs to. The phone only holds the rows of the batch open in front of the
// worker, so a premise joined to a row of ANOTHER batch - the same ERF split between a GPS and a Non-GPS
// batch - would otherwise read Not joined, be picked, and be refused by the server with a raw error, or
// worse be joined twice. The premise carries its own row, so it is asked (reviewer, 2026-09-24).
function ownJoinRowId(premise = {}) {
  return clean(premise?.targetedBatchContext?.rowId);
}

// Every premise on the row's ERF, with what it is joined to. A premise already joined to another row is
// listed and greyed, never hidden: the worker must see that the shop is taken, not wonder where it went
// (TB-R067 1). The row's own premise is listed as its own and can be opened.
export function buildRowPremiseChoices({
  premises = [],
  rows = [],
  currentRowId = "",
  erfId = "",
} = {}) {
  const erf = clean(erfId);
  const rowId = clean(currentRowId);

  return (Array.isArray(premises) ? premises : [])
    .filter((premise) => premiseId(premise) && (!erf || premiseErfId(premise) === erf))
    .map((premise) => {
      const id = premiseId(premise);
      const row = joinedRow(id, rows);
      const joinedRowId = clean(row?.id) || ownJoinRowId(premise);
      const isOwnRow = Boolean(joinedRowId) && joinedRowId === rowId;

      return {
        premiseId: id,
        title: premiseTitle(premise),
        propertyType: premiseType(premise),
        nameLabel: premiseNameLabel(premiseType(premise)),
        joinedRowId: joinedRowId || null,
        joinedMeterNo: clean(row?.meterNo) || clean(premise?.targetedBatchContext?.targetedMeterNo) || null,
        // TB-R067 5: one premise, one row. A premise on another row cannot be picked.
        selectable: !joinedRowId || isOwnRow,
        isOwnRow,
        premise,
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title));
}

// What the list says under each premise.
export function choiceStatusText(choice = {}) {
  if (choice?.isOwnRow) return "This row's premise";
  if (choice?.joinedRowId) {
    return choice?.joinedMeterNo
      ? `Joined to meter ${choice.joinedMeterNo}`
      : "Joined to another meter";
  }
  return "Not joined";
}

// TB-R067 1: with nothing on the ERF there is nothing to choose from, so the New premise form opens
// straight away, as it always has.
export function rowPremiseChoiceNeeded(choices = []) {
  return Array.isArray(choices) && choices.length > 0;
}
