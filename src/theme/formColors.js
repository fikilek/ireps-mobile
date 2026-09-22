import { MD3LightTheme } from "react-native-paper";

/**
 * UI-R004 — on a form, every word a worker reads is black.
 *
 * A field worker reads the phone outdoors. The slate greys the app used for
 * field names, existing values and hints disappear in sunlight, so the owner
 * could not read a meter number on Meter Inspection (23 September 2026).
 *
 * No screen writes a colour of its own any more. It takes it from here.
 */

// Every word on a form: the field name, the value in the box, the
// "Existing iREPS value" line, helper lines and section headings.
export const FORM_TEXT = "#000000";

// The hint inside an empty box. It is always an instruction
// ("Enter meter number"), never a value, so black cannot make an empty box
// look filled (UI-R004 section 4).
export const FORM_PLACEHOLDER = "#000000";

/**
 * A hint that is not yet an instruction.
 *
 * UI-R004 section 4: a hint must tell the worker what to do, never show a
 * value. A handful of boxes still show a value-shaped hint ("NAv", "10",
 * "Other"). Black would make those empty boxes look filled, so they keep the
 * old grey until the owner rewords them, and they say so here rather than
 * hiding in a screen.
 *
 * Every use of this is a box waiting to be reworded. When the list is empty,
 * delete it.
 */
export const HINT_PENDING_REWORD = "#94a3b8";

// An error stays red. It is a signal, not a word to read past.
export const FORM_ERROR = "#b91c1c";

/**
 * The phone's react-native-paper theme. It carries the colours above to every
 * Paper input box in the app without each screen setting them, which is how
 * the forms that are frozen for the Normalisation release get the fix too.
 */
export const irepsPaperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    // The value inside the box.
    onSurface: FORM_TEXT,
    // The field name that floats above the box, and the hint inside it.
    onSurfaceVariant: FORM_PLACEHOLDER,
    error: FORM_ERROR,
  },
};
