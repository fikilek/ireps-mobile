// One tap often saves several fields at once — a select and its text, or a
// choice and the fields it clears. Formik checks the form after every single
// save using the values from before the tap, so the last check never saw the
// first change: the field stayed red until it was chosen a second time. Saves
// made in one tap are gathered here, applied in one step, and checked once.
import { getIn, setIn } from "formik";

export function makeBatchedSetFieldValue({ setValues, pendingRef }) {
  return (field, value) => {
    if (!pendingRef.current) {
      pendingRef.current = { changes: [] };

      Promise.resolve().then(() => {
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (!pending) return;

        // GPS/camera callbacks may finish after more typing. Apply only their
        // changes to Formik's current values, never to a pre-capture snapshot.
        setValues(
          (currentValues) => pending.changes.reduce(
            (acc, [path, nextValue]) => setIn(
              acc, path,
              typeof nextValue === "function" ? nextValue(getIn(acc, path)) : nextValue,
            ),
            currentValues,
          ),
          true,
        );
      });
    }

    pendingRef.current.changes.push([field, value]);
    return Promise.resolve();
  };
}
