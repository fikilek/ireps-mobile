// OF-R002 (1.0.0) section 7: a supervisor's removal of work that never reached the office is
// recorded. The record stays on the phone so that "where did that capture go?" always has an
// answer, even with no signal.
import { createMMKV } from "react-native-mmkv";

import { buildRemovalRecord } from "../features/savedWork/savedWorkRemovalRules";

const REMOVAL_LOG_STORAGE_KEY = "removed_work_log";
const MAX_RECORDS = 200;

const removalLogStorage = createMMKV({ id: "ireps-removed-work-log" });

const readLog = () => {
  try {
    const raw = removalLogStorage.getString(REMOVAL_LOG_STORAGE_KEY);

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.log("workRemovalLog readLog error:", error);
    return [];
  }
};

const writeLog = (records) => {
  try {
    removalLogStorage.set(
      REMOVAL_LOG_STORAGE_KEY,
      JSON.stringify(Array.isArray(records) ? records : []),
    );

    return { success: true };
  } catch (error) {
    console.log("workRemovalLog writeLog error:", error);
    return { success: false, error };
  }
};

export const getWorkRemovalLog = () => readLog();

export const recordWorkRemoval = (details = {}) => {
  const record = buildRemovalRecord(details);

  // Newest first, and the log never grows without end: it is a trail, not a second copy of the
  // work. The work itself is what must never be lost.
  const next = [record, ...readLog()].slice(0, MAX_RECORDS);

  const saved = writeLog(next);

  return { success: saved?.success === true, record };
};

export const clearWorkRemovalLog = () => writeLog([]);
