import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  useGetIrepsSelectLookupQuery,
  useSetIrepsSelectLookupStatusMutation,
  useSetIrepsSelectOptionStatusMutation,
  useUpdateIrepsSelectLookupMutation,
} from "@/src/redux/irepsSelectLookupsApi";
import {
  FORM_TEXT,
  FORM_PLACEHOLDER

} from "../../../../../src/theme/formColors";

function statusUi(status) {
  const clean = String(status || "").toUpperCase();

  if (clean === "PUBLISHED") {
    return {
      label: "Published",
      bg: "#DCFCE7",
      fg: "#166534",
    };
  }

  if (clean === "DRAFT") {
    return {
      label: "Draft",
      bg: "#FEF3C7",
      fg: "#92400E",
    };
  }

  if (clean === "DISABLED") {
    return {
      label: "Disabled",
      bg: "#E5E7EB",
      fg: "#374151",
    };
  }

  if (clean === "ARCHIVED") {
    return {
      label: "Archived",
      bg: "#FEE2E2",
      fg: "#991B1B",
    };
  }

  return {
    label: clean || "Unknown",
    bg: "#E0E7FF",
    fg: "#3730A3",
  };
}

function StatusBadge({ status }) {
  const ui = statusUi(status);

  return (
    <View style={[styles.statusBadge, { backgroundColor: ui.bg }]}>
      <Text style={[styles.statusBadgeText, { color: ui.fg }]}>{ui.label}</Text>
    </View>
  );
}

function ConfirmActionButton({
  label,
  icon,
  color = "#2563EB",
  title,
  message,
  onConfirm,
  disabled,
}) {
  function handlePress() {
    Alert.alert(title || label, message || "Are you sure?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: label,
        style: color === "#B91C1C" ? "destructive" : "default",
        onPress: onConfirm,
      },
    ]);
  }

  return (
    <Pressable
      disabled={disabled}
      onPress={handlePress}
      style={[
        styles.actionButton,
        { borderColor: color },
        disabled && styles.disabledButton,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={17} color={color} />
      <Text style={[styles.actionButtonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function EditableLookupModal({ visible, lookup, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    title: lookup?.title || "",
    description: lookup?.description || "",
    domain: lookup?.domain || "",
    fieldKey: lookup?.fieldKey || "",
    allowOther: lookup?.allowOther !== false,
    otherLabel: lookup?.otherLabel || "Other",
    system: Boolean(lookup?.system),
  });

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleSave() {
    if (!form.title.trim()) {
      Alert.alert("Title required", "Please enter a lookup title.");
      return;
    }

    if (!form.domain.trim()) {
      Alert.alert("Domain required", "Please enter a lookup domain.");
      return;
    }

    if (form.allowOther && !form.otherLabel.trim()) {
      Alert.alert(
        "Other label required",
        "Please enter the label for the Other option.",
      );
      return;
    }

    onSave({
      title: form.title.trim(),
      description: form.description.trim(),
      domain: form.domain.trim().toUpperCase(),
      fieldKey: form.fieldKey.trim(),
      allowOther: form.allowOther,
      otherLabel: form.allowOther ? form.otherLabel.trim() : "",
      system: Boolean(form.system),
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Lookup</Text>

            <Pressable onPress={onClose} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={24} color="#111827" />
            </Pressable>
          </View>

          <ScrollView
            style={styles.modalBody}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              value={form.title}
              onChangeText={(text) => updateField("title", text)}
              placeholder="Lookup title"
              placeholderTextColor={FORM_PLACEHOLDER}
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              value={form.description}
              onChangeText={(text) => updateField("description", text)}
              placeholder="Description"
              placeholderTextColor={FORM_PLACEHOLDER}
              style={[styles.input, styles.textArea]}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.fieldLabel}>Domain</Text>
            <TextInput
              value={form.domain}
              onChangeText={(text) =>
                updateField(
                  "domain",
                  String(text || "")
                    .toUpperCase()
                    .replace(/[^A-Z0-9_]/g, "_"),
                )
              }
              placeholder="METER_REMOVAL"
              placeholderTextColor={FORM_PLACEHOLDER}
              style={styles.input}
              autoCapitalize="characters"
            />

            <Text style={styles.fieldLabel}>Field key</Text>
            <TextInput
              value={form.fieldKey}
              onChangeText={(text) => updateField("fieldKey", text)}
              placeholder="removal.finalReading.noReadingReason"
              placeholderTextColor={FORM_PLACEHOLDER}
              style={styles.input}
              autoCapitalize="none"
            />

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>Allow Other</Text>
                <Text style={styles.switchSubtitle}>
                  IrepsSelectWithOther will show an Other option.
                </Text>
              </View>

              <Switch
                value={form.allowOther}
                onValueChange={(value) => updateField("allowOther", value)}
              />
            </View>

            {form.allowOther ? (
              <>
                <Text style={styles.fieldLabel}>Other label</Text>
                <TextInput
                  value={form.otherLabel}
                  onChangeText={(text) => updateField("otherLabel", text)}
                  placeholder="Other"
                  placeholderTextColor={FORM_PLACEHOLDER}
                  style={styles.input}
                />
              </>
            ) : null}

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>System lookup</Text>
                <Text style={styles.switchSubtitle}>
                  Protects important iREPS lookups from archive actions.
                </Text>
              </View>

              <Switch
                value={form.system}
                onValueChange={(value) => updateField("system", value)}
              />
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <Pressable
              style={styles.secondaryModalButton}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={styles.secondaryModalButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              style={[styles.primaryModalButton, saving && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryModalButtonText}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function OptionCard({ option, lookupKey, onSetStatus, busy }) {
  const optionCode = option?.code || option?.id || "NAv";
  const status = String(option?.status || "").toUpperCase();

  return (
    <View style={styles.optionCard}>
      <View style={styles.optionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.optionLabel}>{option?.label || optionCode}</Text>
          <Text style={styles.optionCode}>{optionCode}</Text>
        </View>

        <StatusBadge status={status} />
      </View>

      {option?.description ? (
        <Text style={styles.optionDescription}>{option.description}</Text>
      ) : null}

      <View style={styles.optionMetaRow}>
        <View style={styles.metaPill}>
          <MaterialCommunityIcons
            name="sort-numeric-ascending"
            size={14}
            color="#6B7280"
          />
          <Text style={styles.metaPillText}>
            Order {Number(option?.sortOrder ?? 9999)}
          </Text>
        </View>

        {option?.system ? (
          <View style={styles.metaPill}>
            <MaterialCommunityIcons
              name="shield-check-outline"
              size={14}
              color="#6B7280"
            />
            <Text style={styles.metaPillText}>System</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.optionActions}>
        <Pressable
          style={styles.smallButton}
          onPress={() =>
            router.push({
              pathname: "/(tabs)/admin/settings/select-lookups/option",
              params: {
                mode: "edit",
                lookupKey,
                optionCode,
              },
            })
          }
        >
          <MaterialCommunityIcons name="pencil" size={15} color="#2563EB" />
          <Text style={styles.smallButtonText}>Edit</Text>
        </Pressable>

        {status !== "PUBLISHED" ? (
          <Pressable
            disabled={busy}
            style={styles.smallButton}
            onPress={() =>
              onSetStatus({
                optionCode,
                action: "PUBLISH_OPTION",
              })
            }
          >
            <MaterialCommunityIcons
              name="check-circle-outline"
              size={15}
              color="#166534"
            />
            <Text style={[styles.smallButtonText, { color: "#166534" }]}>
              Publish
            </Text>
          </Pressable>
        ) : null}

        {status !== "DISABLED" ? (
          <Pressable
            disabled={busy}
            style={styles.smallButton}
            onPress={() =>
              onSetStatus({
                optionCode,
                action: "DISABLE_OPTION",
              })
            }
          >
            <MaterialCommunityIcons
              name="pause-circle-outline"
              size={15}
              color="#92400E"
            />
            <Text style={[styles.smallButtonText, { color: "#92400E" }]}>
              Disable
            </Text>
          </Pressable>
        ) : null}

        {status !== "ARCHIVED" ? (
          <Pressable
            disabled={busy}
            style={styles.smallButton}
            onPress={() =>
              Alert.alert(
                "Archive option",
                `Archive option ${optionCode}? System options cannot be archived.`,
                [
                  {
                    text: "Cancel",
                    style: "cancel",
                  },
                  {
                    text: "Archive",
                    style: "destructive",
                    onPress: () =>
                      onSetStatus({
                        optionCode,
                        action: "ARCHIVE_OPTION",
                      }),
                  },
                ],
              )
            }
          >
            <MaterialCommunityIcons
              name="archive-outline"
              size={15}
              color="#B91C1C"
            />
            <Text style={[styles.smallButtonText, { color: "#B91C1C" }]}>
              Archive
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function SelectLookupDetailScreen() {
  const params = useLocalSearchParams();
  const lookupKey = String(params.lookupKey || "");

  const [editModalVisible, setEditModalVisible] = useState(false);

  const { data, isLoading, isFetching, error, refetch } =
    useGetIrepsSelectLookupQuery(lookupKey, {
      skip: !lookupKey,
    });

  const [updateLookup, { isLoading: isUpdatingLookup }] =
    useUpdateIrepsSelectLookupMutation();

  const [setLookupStatus, { isLoading: isSettingLookupStatus }] =
    useSetIrepsSelectLookupStatusMutation();

  const [setOptionStatus, { isLoading: isSettingOptionStatus }] =
    useSetIrepsSelectOptionStatusMutation();

  const lookup = data?.lookup || null;
  const options = useMemo(() => data?.options || [], [data?.options]);

  async function handleUpdateLookup(patch) {
    try {
      await updateLookup({
        lookupKey,
        patch,
      }).unwrap();

      setEditModalVisible(false);
      Alert.alert("Lookup updated", "The lookup details were saved.");
    } catch (err) {
      Alert.alert("Update failed", err?.message || "Could not update lookup.");
    }
  }

  async function handleSetLookupStatus(action) {
    try {
      await setLookupStatus({
        lookupKey,
        action,
      }).unwrap();

      Alert.alert("Status updated", "Lookup status was updated.");
    } catch (err) {
      Alert.alert(
        "Status update failed",
        err?.message || "Could not update lookup status.",
      );
    }
  }

  async function handleSetOptionStatus({ optionCode, action }) {
    try {
      await setOptionStatus({
        lookupKey,
        optionCode,
        action,
      }).unwrap();

      Alert.alert("Option updated", "Option status was updated.");
    } catch (err) {
      Alert.alert(
        "Option update failed",
        err?.message || "Could not update option status.",
      );
    }
  }

  function handleAddOption() {
    router.push({
      pathname: "/(tabs)/admin/settings/select-lookups/option",
      params: {
        mode: "create",
        lookupKey,
      },
    });
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.centerText}>Loading lookup...</Text>
      </View>
    );
  }

  if (error || !lookup) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons
          name="alert-circle-outline"
          size={42}
          color="#B91C1C"
        />
        <Text style={styles.errorTitle}>Could not load lookup</Text>
        <Text style={styles.errorMessage}>
          {error?.message || "The lookup was not found."}
        </Text>

        <Pressable style={styles.primaryButton} onPress={refetch}>
          <Text style={styles.primaryButtonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  const lookupStatus = String(lookup?.status || "").toUpperCase();

  return (
    <View style={styles.screen}>
      <EditableLookupModal
        key={lookup?.lookupKey}
        visible={editModalVisible}
        lookup={lookup}
        onClose={() => setEditModalVisible(false)}
        onSave={handleUpdateLookup}
        saving={isUpdatingLookup}
      />

      <FlatList
        data={options}
        keyExtractor={(item) => item?.code || item?.id}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} />
        }
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <View style={styles.headerCard}>
              <View style={styles.headerTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.screenTitle}>{lookup.title}</Text>
                  <Text style={styles.lookupKey}>{lookup.lookupKey}</Text>
                </View>

                <StatusBadge status={lookup.status} />
              </View>

              {lookup.description ? (
                <Text style={styles.description}>{lookup.description}</Text>
              ) : null}

              <View style={styles.metaGrid}>
                <View style={styles.metaTile}>
                  <Text style={styles.metaLabel}>Domain</Text>
                  <Text style={styles.metaValue}>{lookup.domain || "NAv"}</Text>
                </View>

                <View style={styles.metaTile}>
                  <Text style={styles.metaLabel}>Version</Text>
                  <Text style={styles.metaValue}>v{lookup.version || 1}</Text>
                </View>

                <View style={styles.metaTile}>
                  <Text style={styles.metaLabel}>Options</Text>
                  <Text style={styles.metaValue}>
                    {Number(lookup.optionCount || options.length)}
                  </Text>
                </View>

                <View style={styles.metaTile}>
                  <Text style={styles.metaLabel}>Other</Text>
                  <Text style={styles.metaValue}>
                    {lookup.allowOther !== false
                      ? lookup.otherLabel || "Other"
                      : "Disabled"}
                  </Text>
                </View>
              </View>

              {lookup.fieldKey ? (
                <View style={styles.fieldKeyBox}>
                  <Text style={styles.fieldKeyLabel}>Field key</Text>
                  <Text style={styles.fieldKeyValue}>{lookup.fieldKey}</Text>
                </View>
              ) : null}

              <View style={styles.lookupActions}>
                <Pressable
                  style={styles.primaryOutlineButton}
                  onPress={() => setEditModalVisible(true)}
                >
                  <MaterialCommunityIcons
                    name="pencil"
                    size={17}
                    color="#2563EB"
                  />
                  <Text style={styles.primaryOutlineButtonText}>Edit</Text>
                </Pressable>

                {lookupStatus !== "PUBLISHED" ? (
                  <ConfirmActionButton
                    label="Publish"
                    icon="check-circle-outline"
                    color="#166534"
                    title="Publish lookup"
                    message="Published lookups become available to forms through onIrepsSelectOptionsCallable."
                    disabled={isSettingLookupStatus}
                    onConfirm={() => handleSetLookupStatus("PUBLISH_LOOKUP")}
                  />
                ) : null}

                {lookupStatus !== "DISABLED" ? (
                  <ConfirmActionButton
                    label="Disable"
                    icon="pause-circle-outline"
                    color="#92400E"
                    title="Disable lookup"
                    message="Disabled lookups will no longer be returned to normal forms."
                    disabled={isSettingLookupStatus}
                    onConfirm={() => handleSetLookupStatus("DISABLE_LOOKUP")}
                  />
                ) : null}

                {lookupStatus !== "ARCHIVED" ? (
                  <ConfirmActionButton
                    label="Archive"
                    icon="archive-outline"
                    color="#B91C1C"
                    title="Archive lookup"
                    message="Archive this lookup? System lookups cannot be archived."
                    disabled={isSettingLookupStatus}
                    onConfirm={() => handleSetLookupStatus("ARCHIVE_LOOKUP")}
                  />
                ) : null}
              </View>
            </View>

            <View style={styles.optionsHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Options</Text>
                <Text style={styles.sectionSubtitle}>
                  Create, publish, disable, or archive dropdown options.
                </Text>
              </View>

              <Pressable
                style={styles.addOptionButton}
                onPress={handleAddOption}
              >
                <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
                <Text style={styles.addOptionButtonText}>Add</Text>
              </Pressable>
            </View>
          </>
        }
        renderItem={({ item }) => (
          <OptionCard
            option={item}
            lookupKey={lookupKey}
            busy={isSettingOptionStatus}
            onSetStatus={handleSetOptionStatus}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons
              name="format-list-bulleted"
              size={38}
              color="#9CA3AF"
            />
            <Text style={styles.emptyTitle}>No options yet</Text>
            <Text style={styles.emptyText}>
              Add the first option. Options are created as DRAFT and must be
              published before normal forms can use them.
            </Text>

            <Pressable
              style={[styles.primaryButton, { marginTop: 14 }]}
              onPress={handleAddOption}
            >
              <Text style={styles.primaryButtonText}>Add Option</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F9FAFB",
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
  },

  errorMessage: {
    marginTop: 6,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },

  headerCard: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 16,
  },

  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  screenTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: "#111827",
    paddingRight: 12,
  },

  lookupKey: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "800",
    color: "#6B7280",
  },

  description: {
    marginTop: 12,
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 19,
  },

  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },

  statusBadgeText: {
    fontSize: 10,
    fontWeight: "900",
  },

  metaGrid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  metaTile: {
    width: "48%",
    padding: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  metaLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: FORM_TEXT,
    textTransform: "uppercase",
  },

  metaValue: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "900",
    color: FORM_TEXT,
  },

  fieldKeyBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },

  fieldKeyLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: "#2563EB",
    textTransform: "uppercase",
  },

  fieldKeyValue: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "800",
    color: "#1E3A8A",
  },

  lookupActions: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  primaryOutlineButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryOutlineButtonText: {
    marginLeft: 5,
    fontSize: 12,
    fontWeight: "900",
    color: "#2563EB",
  },

  actionButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  actionButtonText: {
    marginLeft: 5,
    fontSize: 12,
    fontWeight: "900",
  },

  disabledButton: {
    opacity: 0.5,
  },

  optionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },

  sectionSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 17,
  },

  addOptionButton: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  addOptionButtonText: {
    marginLeft: 5,
    fontSize: 13,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  optionCard: {
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 12,
  },

  optionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  optionLabel: {
    fontSize: 16,
    fontWeight: "900",
    color: FORM_TEXT,
    paddingRight: 10,
  },

  optionCode: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "800",
    color: "#6B7280",
  },

  optionDescription: {
    marginTop: 10,
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 18,
  },

  optionMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },

  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
  },

  metaPillText: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
  },

  optionActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },

  smallButton: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
  },

  smallButtonText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: "900",
    color: "#2563EB",
  },

  emptyCard: {
    marginTop: 10,
    padding: 24,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },

  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
  },

  emptyText: {
    marginTop: 5,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 18,
  },

  primaryButton: {
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

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.48)",
    justifyContent: "flex-end",
  },

  modalCard: {
    maxHeight: "88%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
  },

  modalHeader: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },

  modalBody: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },

  fieldLabel: {
    marginTop: 12,
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
    minHeight: 90,
  },

  switchRow: {
    marginTop: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
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

  modalFooter: {
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    flexDirection: "row",
    gap: 10,
  },

  secondaryModalButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryModalButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#374151",
  },

  primaryModalButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryModalButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FFFFFF",
  },
});
