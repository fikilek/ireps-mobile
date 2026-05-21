import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export function IrepsFormActions({
  resetLabel = "RESET",
  saveLabel = "SAVE",
  submitLabel = "SUBMIT",

  onReset,
  onSave,
  onSubmit,

  canSave = true,
  canSubmit = false,

  loading = false,
  saveLoading = false,

  disabledReason = "",
  saveDisabledReason = "",
}) {
  const hasSave = typeof onSave === "function";

  const isSaveDisabled = !canSave || loading || saveLoading;
  const isSubmitDisabled = !canSubmit || loading || saveLoading;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TouchableOpacity
          style={[
            styles.button,
            styles.resetButton,
            (loading || saveLoading) && styles.resetButtonDisabled,
          ]}
          onPress={onReset}
          disabled={loading || saveLoading}
          activeOpacity={0.82}
        >
          <Text
            style={[
              styles.resetButtonText,
              (loading || saveLoading) && styles.resetButtonTextDisabled,
            ]}
          >
            {resetLabel}
          </Text>
        </TouchableOpacity>

        {hasSave && (
          <TouchableOpacity
            style={[
              styles.button,
              styles.saveButton,
              !canSave && !saveLoading && styles.saveButtonInvalid,
              canSave && !saveLoading && styles.saveButtonReady,
              saveLoading && styles.saveButtonLoading,
            ]}
            onPress={onSave}
            disabled={isSaveDisabled}
            activeOpacity={0.86}
          >
            {saveLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#1E3A8A" size="small" />
                <Text style={styles.saveButtonLoadingText}>SAVING</Text>
              </View>
            ) : (
              <Text
                style={[
                  styles.saveButtonText,
                  !canSave && styles.saveButtonInvalidText,
                ]}
              >
                {saveLabel}
              </Text>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.button,
            styles.submitButton,
            !canSubmit && !loading && styles.submitButtonInvalid,
            canSubmit && !loading && styles.submitButtonReady,
            loading && styles.submitButtonLoading,
          ]}
          onPress={onSubmit}
          disabled={isSubmitDisabled}
          activeOpacity={0.86}
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#7C2D12" size="small" />
              <Text style={styles.submitButtonLoadingText}>SUBMITTING</Text>
            </View>
          ) : (
            <Text
              style={[
                styles.submitButtonText,
                !canSubmit && styles.submitButtonInvalidText,
              ]}
            >
              {submitLabel}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {!!saveDisabledReason && hasSave && !canSave && !saveLoading && (
        <Text style={styles.disabledReason}>{saveDisabledReason}</Text>
      )}

      {!!disabledReason && !canSubmit && !loading && (
        <Text style={styles.disabledReason}>{disabledReason}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 24,
  },

  row: {
    flexDirection: "row",
    gap: 10,
  },

  button: {
    minHeight: 50,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },

  resetButton: {
    flex: 0.75,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },

  resetButtonDisabled: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    opacity: 0.65,
  },

  resetButtonText: {
    color: "#475569",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.4,
  },

  resetButtonTextDisabled: {
    color: "#94A3B8",
  },

  saveButton: {
    flex: 0.9,
  },

  saveButtonInvalid: {
    backgroundColor: "#CBD5E1",
  },

  saveButtonReady: {
    backgroundColor: "#DBEAFE",
    borderWidth: 1,
    borderColor: "#93C5FD",
  },

  saveButtonLoading: {
    backgroundColor: "#BFDBFE",
  },

  saveButtonText: {
    color: "#1D4ED8",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.4,
  },

  saveButtonInvalidText: {
    color: "#64748B",
  },

  saveButtonLoadingText: {
    color: "#1E3A8A",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.4,
    marginLeft: 8,
  },

  submitButton: {
    flex: 1.7,
  },

  submitButtonInvalid: {
    backgroundColor: "#94A3B8",
  },

  submitButtonReady: {
    backgroundColor: "#86EFAC",
  },

  submitButtonLoading: {
    backgroundColor: "#FDE047",
  },

  submitButtonText: {
    color: "#14532D",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.4,
  },

  submitButtonInvalidText: {
    color: "#F8FAFC",
  },

  submitButtonLoadingText: {
    color: "#7C2D12",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.4,
    marginLeft: 8,
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  disabledReason: {
    marginTop: 8,
    fontSize: 11,
    color: "#64748B",
    fontWeight: "700",
    textAlign: "right",
  },
});
