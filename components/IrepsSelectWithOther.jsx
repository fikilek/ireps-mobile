import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FORM_TEXT, FORM_PLACEHOLDER } from "../src/theme/formColors";

export const DEFAULT_OTHER_CODE = "OTHER";
export const DEFAULT_OTHER_LABEL = "Other";

export function makeSelectWithOtherValue(overrides = {}) {
  return {
    code: "",
    label: "",
    otherText: "",
    ...overrides,
  };
}

export function normalizeSelectWithOtherValue(value) {
  if (!value || typeof value !== "object") {
    return makeSelectWithOtherValue();
  }

  return makeSelectWithOtherValue({
    code: value.code ? String(value.code) : "",
    label: value.label ? String(value.label) : "",
    otherText: value.otherText ? String(value.otherText) : "",
  });
}

export function isSelectWithOtherFilled(value, otherCode = DEFAULT_OTHER_CODE) {
  const normalized = normalizeSelectWithOtherValue(value);

  if (!normalized.code) return false;

  if (normalized.code === otherCode) {
    return Boolean(normalized.otherText.trim());
  }

  return true;
}

export function selectWithOtherToText(value, otherCode = DEFAULT_OTHER_CODE) {
  const normalized = normalizeSelectWithOtherValue(value);

  if (!normalized.code) return "";

  if (normalized.code === otherCode) {
    return normalized.otherText.trim();
  }

  return normalized.label.trim();
}

export function selectWithOtherToPayload(
  value,
  otherCode = DEFAULT_OTHER_CODE,
) {
  const normalized = normalizeSelectWithOtherValue(value);
  const text = selectWithOtherToText(normalized, otherCode);

  return {
    code: normalized.code,
    label: normalized.label,
    otherText: normalized.otherText.trim(),
    text,
    isOther: normalized.code === otherCode,
  };
}

function normalizeOption(option) {
  if (typeof option === "string") {
    return {
      code: option,
      label: option,
      description: "",
      disabled: false,
    };
  }

  const code = String(option?.code ?? option?.value ?? option?.label ?? "");
  const label = String(option?.label ?? option?.code ?? option?.value ?? "");

  return {
    code,
    label,
    description: String(option?.description ?? ""),
    disabled: Boolean(option?.disabled || option?.enabled === false),
  };
}

export default function IrepsSelectWithOther({
  label,
  placeholder = "Select an option",
  options = [],
  value,
  onChange,
  onBlur,
  errorText,
  helperText,
  required = false,
  disabled = false,
  loading = false,
  includeOther = true,
  otherCode = DEFAULT_OTHER_CODE,
  otherLabel = DEFAULT_OTHER_LABEL,
  otherPlaceholder = "Enter other details",
  testID,
  style,
}) {
  const [modalVisible, setModalVisible] = useState(false);

  const selectedValue = normalizeSelectWithOtherValue(value);
  const isOtherSelected = selectedValue.code === otherCode;
  const hasError = Boolean(errorText);

  const normalizedOptions = useMemo(() => {
    const cleanOptions = Array.isArray(options)
      ? options.map(normalizeOption).filter((item) => item.code && item.label)
      : [];

    const hasOther = cleanOptions.some((item) => item.code === otherCode);

    if (includeOther && !hasOther) {
      cleanOptions.push({
        code: otherCode,
        label: otherLabel,
        description: "",
        disabled: false,
      });
    }

    return cleanOptions;
  }, [options, includeOther, otherCode, otherLabel]);

  const displayText = useMemo(() => {
    if (loading) return "Loading options...";

    if (!selectedValue.code) return placeholder;

    if (selectedValue.code === otherCode) {
      if (selectedValue.otherText.trim()) {
        return `${otherLabel}: ${selectedValue.otherText.trim()}`;
      }

      return otherLabel;
    }

    return selectedValue.label || selectedValue.code;
  }, [
    loading,
    placeholder,
    selectedValue.code,
    selectedValue.label,
    selectedValue.otherText,
    otherCode,
    otherLabel,
  ]);

  function handleOpen() {
    if (disabled || loading) return;
    setModalVisible(true);
  }

  function handleClose() {
    setModalVisible(false);
    onBlur?.();
  }

  function handleSelect(option) {
    if (option.disabled) return;

    const nextValue = {
      code: option.code,
      label: option.label,
      otherText:
        option.code === otherCode && selectedValue.code === otherCode
          ? selectedValue.otherText
          : "",
    };

    onChange?.(nextValue);
    setModalVisible(false);
    onBlur?.();
  }

  function handleOtherTextChange(text) {
    onChange?.({
      code: otherCode,
      label: selectedValue.label || otherLabel,
      otherText: text,
    });
  }

  return (
    <View style={[styles.root, style]} testID={testID}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}

      <Pressable
        disabled={disabled || loading}
        onPress={handleOpen}
        style={[
          styles.selectButton,
          hasError && styles.inputError,
          (disabled || loading) && styles.inputDisabled,
        ]}
      >
        <Text
          style={[
            styles.selectText,
            !selectedValue.code && styles.placeholderText,
            (disabled || loading) && styles.disabledText,
          ]}
          numberOfLines={2}
        >
          {displayText}
        </Text>

        {loading ? (
          <MaterialCommunityIcons name="sync" size={20} color="#9CA3AF" />
        ) : (
          <MaterialCommunityIcons
            name="chevron-down"
            size={22}
            color={disabled ? "#9CA3AF" : "#374151"}
          />
        )}
      </Pressable>

      {isOtherSelected ? (
        <TextInput
          value={selectedValue.otherText}
          onChangeText={handleOtherTextChange}
          onBlur={onBlur}
          placeholder={otherPlaceholder}
          placeholderTextColor={FORM_PLACEHOLDER}
          editable={!disabled}
          multiline
          textAlignVertical="top"
          style={[
            styles.otherInput,
            hasError && !selectedValue.otherText.trim() && styles.inputError,
            disabled && styles.inputDisabled,
          ]}
        />
      ) : null}

      {helperText && !hasError ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}

      {hasError ? <Text style={styles.errorText}>{errorText}</Text> : null}

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <Pressable style={styles.modalOverlay} onPress={handleClose}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {label || "Select option"}
                </Text>

                {required ? (
                  <Text style={styles.modalSubtitle}>Required field</Text>
                ) : null}
              </View>

              <Pressable onPress={handleClose} hitSlop={12}>
                <MaterialCommunityIcons
                  name="close"
                  size={24}
                  color="#111827"
                />
              </Pressable>
            </View>

            <ScrollView
              style={styles.optionList}
              keyboardShouldPersistTaps="handled"
            >
              {normalizedOptions.length === 0 ? (
                <View style={styles.emptyOptions}>
                  <MaterialCommunityIcons
                    name="database-off-outline"
                    size={32}
                    color="#9CA3AF"
                  />
                  <Text style={styles.emptyTitle}>No options available</Text>
                  <Text style={styles.emptyText}>
                    No published options were found for this lookup.
                  </Text>
                </View>
              ) : (
                normalizedOptions.map((option) => {
                  const active = option.code === selectedValue.code;

                  return (
                    <Pressable
                      key={option.code}
                      disabled={option.disabled}
                      onPress={() => handleSelect(option)}
                      style={[
                        styles.optionRow,
                        active && styles.optionRowActive,
                        option.disabled && styles.optionRowDisabled,
                      ]}
                    >
                      <View style={styles.optionTextWrap}>
                        <Text
                          style={[
                            styles.optionLabel,
                            active && styles.optionLabelActive,
                            option.disabled && styles.disabledText,
                          ]}
                        >
                          {option.label}
                        </Text>

                        {option.description ? (
                          <Text style={styles.optionDescription}>
                            {option.description}
                          </Text>
                        ) : null}

                        <Text style={styles.optionCode}>{option.code}</Text>
                      </View>

                      {active ? (
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={22}
                          color="#2563EB"
                        />
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginBottom: 16,
  },

  label: {
    marginBottom: 6,
    fontSize: 14,
    fontWeight: "800",
    color: FORM_TEXT,
  },

  required: {
    color: "#B91C1C",
  },

  selectButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  selectText: {
    flex: 1,
    fontSize: 15,
    color: FORM_TEXT,
    paddingRight: 12,
  },

  placeholderText: {
    color: FORM_TEXT,
  },

  inputError: {
    borderColor: "#B91C1C",
  },

  inputDisabled: {
    backgroundColor: "#F3F4F6",
    opacity: 0.8,
  },

  disabledText: {
    // A signal, not a word to read: a control or an option the worker
    // cannot use stays grey so it does not look live (UI-R004 section 2).
    color: "#9CA3AF",
  },

  otherInput: {
    marginTop: 10,
    minHeight: 86,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    fontSize: 15,
    color: FORM_TEXT,
  },

  helperText: {
    marginTop: 6,
    fontSize: 12,
    color: FORM_TEXT,
    lineHeight: 17,
  },

  errorText: {
    marginTop: 6,
    fontSize: 12,
    color: "#B91C1C",
    fontWeight: "700",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.48)",
    justifyContent: "center",
    padding: 18,
  },

  modalCard: {
    maxHeight: "78%",
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.16,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      },
      android: {
        elevation: 8,
      },
      default: {},
    }),
  },

  modalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
  },

  modalTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: FORM_TEXT,
  },

  modalSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "700",
    color: FORM_TEXT,
  },

  optionList: {
    maxHeight: 430,
  },

  optionRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    flexDirection: "row",
    alignItems: "center",
  },

  optionRowActive: {
    backgroundColor: "#EFF6FF",
  },

  optionRowDisabled: {
    backgroundColor: "#F9FAFB",
  },

  optionTextWrap: {
    flex: 1,
    paddingRight: 12,
  },

  optionLabel: {
    fontSize: 15,
    fontWeight: "900",
    color: FORM_TEXT,
  },

  optionLabelActive: {
    color: "#1D4ED8",
  },

  optionDescription: {
    marginTop: 3,
    fontSize: 12,
    color: FORM_TEXT,
    lineHeight: 17,
  },

  optionCode: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "700",
    color: FORM_TEXT,
  },

  emptyOptions: {
    padding: 28,
    alignItems: "center",
  },

  emptyTitle: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "900",
    color: FORM_TEXT,
  },

  emptyText: {
    marginTop: 4,
    fontSize: 12,
    color: FORM_TEXT,
    textAlign: "center",
    lineHeight: 17,
  },
});
