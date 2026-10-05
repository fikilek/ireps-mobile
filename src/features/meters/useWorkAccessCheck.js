import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import {
  BATCH_WORK_BLOCKED, BATCH_WORK_BLOCKED_FOOTER, BATCH_WORK_BLOCKED_TITLE,
  checkBatchWorkBeforeForm,
} from "./batchWorkGate";

// One pending check belongs to one visible chooser/meter. Cancellation invalidates its result.
export function useWorkAccessCheck({ enabled = true, context } = {}) {
  const [checkingWork, setCheckingWork] = useState(false);
  const pendingCheck = useRef(null);
  const cancelCheck = useCallback(() => {
    pendingCheck.current = null;
    setCheckingWork(false);
  }, []);

  useEffect(() => {
    cancelCheck();
    return () => { pendingCheck.current = null; };
  }, [enabled, context, cancelCheck]);

  const withFrontGate = async (input, open) => {
    // A second tap can arrive before disabled buttons render.
    if (!enabled || pendingCheck.current) return;
    const attempt = {};
    pendingCheck.current = attempt;
    setCheckingWork(true);
    try {
      const gate = await checkBatchWorkBeforeForm(input);
      if (pendingCheck.current !== attempt) return;
      if (gate.state === BATCH_WORK_BLOCKED) {
        Alert.alert(BATCH_WORK_BLOCKED_TITLE, `${gate.message}\n\n${BATCH_WORK_BLOCKED_FOOTER}`);
        return;
      }
      open();
    } finally {
      if (pendingCheck.current === attempt) {
        pendingCheck.current = null;
        setCheckingWork(false);
      }
    }
  };
  return { checkingWork, withFrontGate, cancelCheck };
}
