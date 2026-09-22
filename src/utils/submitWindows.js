// The owner's submit standard (MN-R001 13.1): a confirmation window before
// sending, visible progress while sending, and a result window after — never
// silence. These two windows are shared by the lifecycle forms.
import { Alert } from "react-native";

// Resolves true when the worker chooses to send, false when they go back.
export function confirmSubmit({ title, message, confirmLabel = "SUBMIT" }) {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "GO BACK", style: "cancel", onPress: () => resolve(false) },
        { text: confirmLabel, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

// What happened, in plain words; OK carries on to the next screen.
export function showResult({ title, message, onOk }) {
  Alert.alert(title, message, [{ text: "OK", onPress: onOk }], {
    cancelable: false,
  });
}

export const SAVED_FORMS_PLACE = "Admin → Offline Submission Forms";
