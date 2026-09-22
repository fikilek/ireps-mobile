import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
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

import { useCreateIrepsSelectLookupMutation } from "@/src/redux/irepsSelectLookupsApi";
import { FORM_TEXT, FORM_PLACEHOLDER } from "../../../../../src/theme/formColors";

const LOOKUP_KEY_REGEX = /^[A-Z0-9_]+$/;

const PRESETS = {
  removalInstruction: {
    lookupKey: "METER_REMOVAL_REMOVAL_INSTRUCTION",
    title: "Meter Removal - Removal Instruction",
    description: "Instructions or reasons for meter removal.",
    domain: "METER_REMOVAL",
    fieldKey: "removal.removalInstruction",
    allowOther: true,
    otherLabel: "Other",
    system: true,
  },

  noReadingReason: {
    lookupKey: "METER_REMOVAL_NO_READING_REASON",
    title: "Meter Removal - No Reading Reason",
    description: "Reasons why a final meter reading could not be captured.",
    domain: "METER_REMOVAL",
    fieldKey: "removal.finalReading.noReadingReason",
    allowOther: true,
    otherLabel: "Other",
    system: true,
  },
};

function normalizeLookupKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_");
}

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_");
}

function buildInitialForm() {
  return {
    lookupKey: "",
    title: "",
    description: "",
    domain: "",
    fieldKey: "",
    allowOther: true,
    otherLabel: "Other",
    system: false,
  };
}

function validateForm(form) {
  const errors = {};

  if (!form.lookupKey.trim()) {
    errors.lookupKey = "Lookup key is required.";
  } else if (!LOOKUP_KEY_REGEX.test(form.lookupKey.trim())) {
    errors.lookupKey = "Use uppercase letters, numbers, and underscores only.";
  }

  if (!form.title.trim()) {
    errors.title = "Title is required.";
  }

  if (!form.domain.trim()) {
    errors.domain = "Domain is required.";
  } else if (!LOOKUP_KEY_REGEX.test(form.domain.trim())) {
    errors.domain = "Use uppercase letters, numbers, and underscores only.";
  }

  if (form.allowOther && !form.otherLabel.trim()) {
    errors.otherLabel = "Other label is required when Other is enabled.";
  }

  return errors;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  errorText,
  multiline = false,
  autoCapitalize = "none",
  helperText,
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={FORM_PLACEHOLDER}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        textAlignVertical={multiline ? "top" : "center"}
        style={[
          styles.input,
          multiline && styles.textArea,
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

function PresetButton({ title, subtitle, onPress }) {
  return (
    <Pressable style={styles.presetButton} onPress={onPress}>
      <View style={styles.presetIcon}>
        <MaterialCommunityIcons
          name="lightning-bolt-outline"
          size={18}
          color="#2563EB"
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.presetTitle}>{title}</Text>
        <Text style={styles.presetSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

export default function CreateSelectLookupScreen() {
  const [form, setForm] = useState(buildInitialForm);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [createLookup, { isLoading }] = useCreateIrepsSelectLookupMutation();

  const errors = useMemo(() => validateForm(form), [form]);
  const hasErrors = Object.keys(errors).length > 0;

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function applyPreset(preset) {
    setForm({
      ...buildInitialForm(),
      ...preset,
    });
    setSubmitAttempted(false);
  }

  async function handleCreate() {
    setSubmitAttempted(true);

    if (hasErrors) {
      Alert.alert(
        "Check lookup details",
        "Please fix the highlighted fields before creating the lookup.",
      );
      return;
    }

    const lookup = {
      lookupKey: form.lookupKey.trim(),
      title: form.title.trim(),
      description: form.description.trim(),
      domain: form.domain.trim(),
      fieldKey: form.fieldKey.trim(),
      allowOther: form.allowOther,
      otherLabel: form.allowOther ? form.otherLabel.trim() || "Other" : "",
      system: Boolean(form.system),
    };

    try {
      const result = await createLookup(lookup).unwrap();

      const nextLookupKey = result?.lookupKey || lookup.lookupKey;

      Alert.alert(
        "Lookup created",
        "The lookup was created as a draft. Add options, then publish it when ready.",
        [
          {
            text: "Open Lookup",
            onPress: () =>
              router.replace({
                pathname: "/(tabs)/admin/settings/select-lookups/[lookupKey]",
                params: {
                  lookupKey: nextLookupKey,
                },
              }),
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        "Could not create lookup",
        error?.message || "The lookup could not be created.",
      );
    }
  }

  const shouldShowError = (field) => submitAttempted && errors[field];

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
              name="database-plus-outline"
              size={26}
              color="#2563EB"
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.screenTitle}>Create Lookup</Text>
            <Text style={styles.screenSubtitle}>
              Create a reusable dropdown definition. Options are added after the
              lookup exists.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Quick presets</Text>
          <Text style={styles.sectionSubtitle}>
            Use these to create the first Meter Removal lookup definitions.
          </Text>

          <PresetButton
            title="Removal Instruction"
            subtitle="METER_REMOVAL_REMOVAL_INSTRUCTION"
            onPress={() => applyPreset(PRESETS.removalInstruction)}
          />

          <PresetButton
            title="No Reading Reason"
            subtitle="METER_REMOVAL_NO_READING_REASON"
            onPress={() => applyPreset(PRESETS.noReadingReason)}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Lookup details</Text>

          <Field
            label="Lookup key"
            value={form.lookupKey}
            onChangeText={(text) =>
              updateField("lookupKey", normalizeLookupKey(text))
            }
            placeholder="METER_REMOVAL_NO_READING_REASON"
            errorText={shouldShowError("lookupKey")}
            helperText="Permanent ID. It cannot be changed after creation."
            autoCapitalize="characters"
          />

          <Field
            label="Title"
            value={form.title}
            onChangeText={(text) => updateField("title", text)}
            placeholder="Meter Removal - No Reading Reason"
            errorText={shouldShowError("title")}
            autoCapitalize="sentences"
          />

          <Field
            label="Description"
            value={form.description}
            onChangeText={(text) => updateField("description", text)}
            placeholder="Explain what this dropdown is used for."
            multiline
            autoCapitalize="sentences"
          />

          <Field
            label="Domain"
            value={form.domain}
            onChangeText={(text) =>
              updateField("domain", normalizeDomain(text))
            }
            placeholder="METER_REMOVAL"
            errorText={shouldShowError("domain")}
            helperText="Used to group lookups by module or lifecycle form."
            autoCapitalize="characters"
          />

          <Field
            label="Field key"
            value={form.fieldKey}
            onChangeText={(text) => updateField("fieldKey", text)}
            placeholder="removal.finalReading.noReadingReason"
            helperText="Optional, but useful for ADM/SPU users to know where this lookup is used."
            autoCapitalize="none"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Behaviour</Text>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Allow Other</Text>
              <Text style={styles.switchSubtitle}>
                Adds an Other option in IrepsSelectWithOther.
              </Text>
            </View>

            <Switch
              value={form.allowOther}
              onValueChange={(value) => updateField("allowOther", value)}
            />
          </View>

          {form.allowOther ? (
            <Field
              label="Other label"
              value={form.otherLabel}
              onChangeText={(text) => updateField("otherLabel", text)}
              placeholder="Other"
              errorText={shouldShowError("otherLabel")}
              autoCapitalize="sentences"
            />
          ) : null}

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>System lookup</Text>
              <Text style={styles.switchSubtitle}>
                Protects important iREPS lookups from being archived casually.
              </Text>
            </View>

            <Switch
              value={form.system}
              onValueChange={(value) => updateField("system", value)}
            />
          </View>
        </View>

        <Pressable
          disabled={isLoading}
          style={[
            styles.createButton,
            isLoading && styles.createButtonDisabled,
          ]}
          onPress={handleCreate}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons
                name="check-circle-outline"
                size={20}
                color="#FFFFFF"
              />
              <Text style={styles.createButtonText}>Create Lookup</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.footerNote}>
          New lookups are created as DRAFT. They will not be visible to forms
          until they are published.
        </Text>
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
    color: "#6B7280",
    lineHeight: 18,
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

  sectionSubtitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },

  presetButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginTop: 10,
  },

  presetIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  presetTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111827",
  },

  presetSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
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
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
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

  createButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },

  createButtonDisabled: {
    opacity: 0.7,
  },

  createButtonText: {
    marginLeft: 8,
    fontSize: 15,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  footerNote: {
    marginTop: 12,
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 18,
  },
});
