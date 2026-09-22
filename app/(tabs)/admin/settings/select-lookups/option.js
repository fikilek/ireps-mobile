import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  useCreateIrepsSelectOptionMutation,
  useGetIrepsSelectLookupQuery,
  useUpdateIrepsSelectOptionMutation,
} from "@/src/redux/irepsSelectLookupsApi";
import { FORM_TEXT, FORM_PLACEHOLDER } from "../../../../../src/theme/formColors";

const OPTION_CODE_REGEX = /^[A-Z0-9_]+$/;

function normalizeOptionCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_");
}

function buildInitialForm() {
  return {
    code: "",
    label: "",
    description: "",
    sortOrder: "10",
    system: false,
  };
}

function validateForm(form, mode) {
  const errors = {};

  if (mode === "create") {
    if (!form.code.trim()) {
      errors.code = "Option code is required.";
    } else if (!OPTION_CODE_REGEX.test(form.code.trim())) {
      errors.code = "Use uppercase letters, numbers, and underscores only.";
    } else if (form.code.trim() === "OTHER") {
      errors.code = "OTHER is reserved and cannot be created as an option.";
    }
  }

  if (!form.label.trim()) {
    errors.label = "Label is required.";
  }

  const sortOrder = Number(form.sortOrder);

  if (!Number.isFinite(sortOrder) || sortOrder < 0) {
    errors.sortOrder = "Sort order must be a positive number.";
  }

  return errors;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  errorText,
  helperText,
  editable = true,
  multiline = false,
  keyboardType = "default",
  autoCapitalize = "none",
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={FORM_PLACEHOLDER}
        editable={editable}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        textAlignVertical={multiline ? "top" : "center"}
        style={[
          styles.input,
          multiline && styles.textArea,
          !editable && styles.inputDisabled,
          errorText && styles.inputError,
        ]}
      />

      {helperText && !errorText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}

      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
    </View>
  );
}

export default function SelectLookupOptionScreen() {
  const params = useLocalSearchParams();

  const mode = String(params.mode || "create").toLowerCase();
  const isEditMode = mode === "edit";

  const lookupKey = String(params.lookupKey || "");
  const optionCode = String(params.optionCode || "");

  const [form, setForm] = useState(buildInitialForm);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const {
    data,
    isLoading: isLoadingLookup,
    error: lookupError,
  } = useGetIrepsSelectLookupQuery(lookupKey, {
    skip: !lookupKey,
  });

  const [createOption, { isLoading: isCreating }] =
    useCreateIrepsSelectOptionMutation();

  const [updateOption, { isLoading: isUpdating }] =
    useUpdateIrepsSelectOptionMutation();

  const lookup = data?.lookup || null;

  const existingOption = useMemo(() => {
    if (!isEditMode) return null;

    return (data?.options || []).find((item) => {
      const code = String(item?.code || item?.id || "");
      return code === optionCode;
    });
  }, [data?.options, isEditMode, optionCode]);

  useEffect(() => {
    if (!isEditMode || !existingOption) return;

    setForm({
      code: existingOption.code || existingOption.id || "",
      label: existingOption.label || "",
      description: existingOption.description || "",
      sortOrder: String(existingOption.sortOrder ?? 9999),
      system: Boolean(existingOption.system),
    });
  }, [existingOption, isEditMode]);

  const errors = useMemo(
    () => validateForm(form, isEditMode ? "edit" : "create"),
    [form, isEditMode],
  );

  const hasErrors = Object.keys(errors).length > 0;
  const isSaving = isCreating || isUpdating;

  function shouldShowError(field) {
    return submitAttempted ? errors[field] : "";
  }

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSave() {
    setSubmitAttempted(true);

    if (!lookupKey) {
      Alert.alert("Missing lookup", "lookupKey is required.");
      return;
    }

    if (hasErrors) {
      Alert.alert(
        "Check option details",
        "Please fix the highlighted fields before saving.",
      );
      return;
    }

    try {
      if (isEditMode) {
        await updateOption({
          lookupKey,
          optionCode,
          patch: {
            label: form.label.trim(),
            description: form.description.trim(),
            sortOrder: Number(form.sortOrder),
            system: Boolean(form.system),
          },
        }).unwrap();

        Alert.alert("Option updated", "The option was saved.", [
          {
            text: "OK",
            onPress: () =>
              router.replace({
                pathname: "/(tabs)/admin/settings/select-lookups/[lookupKey]",
                params: { lookupKey },
              }),
          },
        ]);

        return;
      }

      await createOption({
        lookupKey,
        option: {
          code: form.code.trim(),
          label: form.label.trim(),
          description: form.description.trim(),
          sortOrder: Number(form.sortOrder),
          system: Boolean(form.system),
        },
      }).unwrap();

      Alert.alert(
        "Option created",
        "The option was created as DRAFT. Publish it from the lookup detail screen when ready.",
        [
          {
            text: "OK",
            onPress: () =>
              router.replace({
                pathname: "/(tabs)/admin/settings/select-lookups/[lookupKey]",
                params: { lookupKey },
              }),
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        isEditMode ? "Could not update option" : "Could not create option",
        error?.message || "The option could not be saved.",
      );
    }
  }

  if (isLoadingLookup) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.centerText}>Loading lookup...</Text>
      </View>
    );
  }

  if (lookupError || !lookup) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons
          name="alert-circle-outline"
          size={42}
          color="#B91C1C"
        />
        <Text style={styles.errorTitle}>Could not load lookup</Text>
        <Text style={styles.errorMessage}>
          {lookupError?.message || "The lookup was not found."}
        </Text>
      </View>
    );
  }

  if (isEditMode && !existingOption) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons
          name="alert-circle-outline"
          size={42}
          color="#B91C1C"
        />
        <Text style={styles.errorTitle}>Option not found</Text>
        <Text style={styles.errorMessage}>
          The selected option could not be found under this lookup.
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() =>
            router.replace({
              pathname: "/(tabs)/admin/settings/select-lookups/[lookupKey]",
              params: { lookupKey },
            })
          }
        >
          <Text style={styles.primaryButtonText}>Back to Lookup</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerCard}>
          <View style={styles.headerIcon}>
            <MaterialCommunityIcons
              name={isEditMode ? "pencil-outline" : "plus-circle-outline"}
              size={26}
              color="#2563EB"
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.screenTitle}>
              {isEditMode ? "Edit Option" : "Create Option"}
            </Text>

            <Text style={styles.screenSubtitle}>{lookup.title}</Text>

            <Text style={styles.lookupKey}>{lookup.lookupKey}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Option details</Text>

          <Field
            label="Code"
            value={form.code}
            onChangeText={(text) =>
              updateField("code", normalizeOptionCode(text))
            }
            placeholder="DISPLAY_BLANK"
            editable={!isEditMode}
            errorText={shouldShowError("code")}
            helperText={
              isEditMode
                ? "Option code is permanent and cannot be changed."
                : "Permanent option ID. Use uppercase snake case."
            }
            autoCapitalize="characters"
          />

          <Field
            label="Label"
            value={form.label}
            onChangeText={(text) => updateField("label", text)}
            placeholder="Display blank"
            errorText={shouldShowError("label")}
            helperText="This is what the user sees in the dropdown."
            autoCapitalize="sentences"
          />

          <Field
            label="Description"
            value={form.description}
            onChangeText={(text) => updateField("description", text)}
            placeholder="Optional admin description."
            multiline
            autoCapitalize="sentences"
          />

          <Field
            label="Sort order"
            value={form.sortOrder}
            onChangeText={(text) =>
              updateField("sortOrder", text.replace(/[^0-9.]/g, ""))
            }
            placeholder="10"
            keyboardType="numeric"
            errorText={shouldShowError("sortOrder")}
            helperText="Lower numbers appear first. Use 10, 20, 30 so you can insert options later."
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Protection</Text>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>System option</Text>
              <Text style={styles.switchSubtitle}>
                Protects important iREPS options from archive actions.
              </Text>
            </View>

            <Switch
              value={form.system}
              onValueChange={(value) => updateField("system", value)}
            />
          </View>
        </View>

        <View style={styles.noticeCard}>
          <MaterialCommunityIcons
            name="information-outline"
            size={20}
            color="#2563EB"
          />

          <Text style={styles.noticeText}>
            {isEditMode
              ? "Editing an option increments the parent lookup version so cached dropdown data can refresh."
              : "New options are created as DRAFT. Publish the option from the lookup detail screen before forms can use it."}
          </Text>
        </View>

        <Pressable
          disabled={isSaving}
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons
                name="content-save-outline"
                size={20}
                color="#FFFFFF"
              />
              <Text style={styles.saveButtonText}>
                {isEditMode ? "Save Option" : "Create Option"}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable
          disabled={isSaving}
          style={styles.cancelButton}
          onPress={() =>
            router.replace({
              pathname: "/(tabs)/admin/settings/select-lookups/[lookupKey]",
              params: { lookupKey },
            })
          }
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },

  scroll: {
    flex: 1,
  },

  content: {
    padding: 16,
    paddingBottom: 32,
  },

  center: {
    flex: 1,
    padding: 24,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
  },

  centerText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
  },

  errorTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
    textAlign: "center",
  },

  errorMessage: {
    marginTop: 6,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 18,
  },

  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 14,
  },

  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  screenTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
  },

  screenSubtitle: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: "800",
    color: "#374151",
  },

  lookupKey: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "800",
    color: "#6B7280",
  },

  card: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 14,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
  },

  field: {
    marginTop: 14,
  },

  fieldLabel: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "900",
    color: FORM_TEXT,
  },

  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: FORM_TEXT,
  },

  textArea: {
    minHeight: 92,
  },

  inputDisabled: {
    backgroundColor: "#F3F4F6",
    color: FORM_TEXT,
  },

  inputError: {
    borderColor: "#B91C1C",
  },

  helperText: {
    marginTop: 5,
    fontSize: 11,
    color: FORM_TEXT,
    lineHeight: 16,
  },

  errorText: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: "800",
    color: "#B91C1C",
  },

  switchRow: {
    marginTop: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },

  switchTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111827",
  },

  switchSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 17,
    paddingRight: 12,
  },

  noticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    backgroundColor: "#EFF6FF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    marginBottom: 14,
  },

  noticeText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 12,
    color: "#1E3A8A",
    lineHeight: 18,
    fontWeight: "700",
  },

  saveButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },

  saveButtonDisabled: {
    opacity: 0.7,
  },

  saveButtonText: {
    marginLeft: 8,
    fontSize: 15,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  cancelButton: {
    minHeight: 48,
    marginTop: 10,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },

  cancelButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#374151",
  },

  primaryButton: {
    marginTop: 18,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FFFFFF",
  },
});
