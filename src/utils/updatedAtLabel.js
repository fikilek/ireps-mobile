// "Updated 01 Oct, 22:03" — one formatter, for every card that shows when a record last changed.
//
// Moved out of astItem.js on 3 October 2026 when the owner asked for the same footer on the
// premise card. A second copy would have drifted the way everything else in this app drifted:
// the No Access reason had five field names, the access card had five private copies, and the
// address had four different joins before today.
//
// It takes every shape a time arrives in - a Firestore Timestamp, a seconds object, an export's
// __time__, or an ISO string - because a card is handed whatever its screen happens to hold.

export function updatedAtLabel(value) {
  if (!value) return "NAv";

  let dateValue = null;

  if (typeof value?.toDate === "function") {
    dateValue = value.toDate();
  } else if (value?.seconds) {
    dateValue = new Date(value.seconds * 1000);
  } else if (value?.__time__) {
    dateValue = new Date(value.__time__);
  } else {
    dateValue = new Date(value);
  }

  if (Number.isNaN(dateValue?.getTime?.())) return "NAv";

  return dateValue.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
