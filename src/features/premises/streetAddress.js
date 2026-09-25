// One street address, written the way a person writes it.
//
// A premise keeps the street number, the street name and the street type apart. Joining all three blindly
// gives "26 OLDACRE ST Street", because the name people capture usually carries the type already (owner,
// 2026-09-24, on the map label). So the type is added only when the name does not already end in it, in
// full or in its usual short form.
const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");

// The short forms a street name is written with. The type is the word iREPS keeps; the rest are what the
// name may end in.
const STREET_TYPE_FORMS = Object.freeze({
  street: ["street", "str", "st"],
  road: ["road", "rd"],
  avenue: ["avenue", "ave", "av"],
  drive: ["drive", "dr"],
  crescent: ["crescent", "cres"],
  close: ["close", "cl"],
  lane: ["lane", "ln"],
  place: ["place", "pl"],
  boulevard: ["boulevard", "blvd"],
  highway: ["highway", "hwy"],
  terrace: ["terrace", "terr"],
  way: ["way"],
  circle: ["circle", "cir"],
  court: ["court", "crt", "ct"],
});

// Does the street name already end in this type, however it was written?
export function streetNameCarriesType(strName, strType) {
  const name = clean(strName).toLowerCase().replace(/[.,]+$/, "");
  const type = clean(strType).toLowerCase();
  if (!name || !type) return false;

  const forms = STREET_TYPE_FORMS[type] || [type];
  return forms.some((form) => name === form || name.endsWith(` ${form}`) || name.endsWith(` ${form}.`));
}

export function formatStreetAddress(address = {}, { withNumber = true } = {}) {
  const strNo = clean(address?.strNo);
  const strName = clean(address?.strName);
  const strType = clean(address?.strType);

  const type =
    !strType || strType === "Select..." || streetNameCarriesType(strName, strType)
      ? ""
      : strType;

  return [withNumber ? strNo : "", strName, type].filter(Boolean).join(" ").trim();
}
