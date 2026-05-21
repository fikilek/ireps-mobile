import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Surface } from "react-native-paper";

import { useIrepsLookupOptions } from "../../src/hooks/useIrepsLookupOptions";
import IrepsSelectWithOther from "../IrepsSelectWithOther";
import { IrepsMedia } from "../media/IrepsMedia";

export function IrepsNoAccessSection({
  visible = false,
  value,
  onChange,
  mediaName = "media",
  mediaTag = "noAccessPhoto",
  agentName,
  agentUid,
  fallbackGps,
  reasonErrorText = "",
  mediaErrorText = "",
}) {
  const noAccessReasonLookup = useIrepsLookupOptions("METER_NO_ACCESS_REASON");

  // console.log("IrepsNoAccessSection -- METER_NO_ACCESS_REASON", {
  //   optionsCount: noAccessReasonLookup?.options?.length,
  //   options: noAccessReasonLookup?.options,
  //   allowOther: noAccessReasonLookup?.allowOther,
  //   isLoading: noAccessReasonLookup?.isLoading,
  //   isFetching: noAccessReasonLookup?.isFetching,
  //   error: noAccessReasonLookup?.error,
  // });

  if (!visible) return null;

  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons
            name="home-alert-outline"
            size={22}
            color="#DC2626"
          />
        </View>

        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>NO ACCESS</Text>
          <Text style={styles.description}>
            Use this section when the meter or supply point could not be safely
            accessed. The work item can still be completed, but the meter status
            will not be changed to DISCONNECTED.
          </Text>
        </View>
      </View>

      <View style={styles.noticeBox}>
        <MaterialCommunityIcons
          name="information-outline"
          size={17}
          color="#B45309"
        />
        <Text style={styles.noticeText}>
          NO ACCESS is an execution outcome. It is not a workflow state.
        </Text>
      </View>

      <IrepsSelectWithOther
        label="No Access Reason"
        placeholder="Select no-access reason"
        options={noAccessReasonLookup.options}
        includeOther={noAccessReasonLookup.allowOther ?? true}
        otherCode={noAccessReasonLookup.otherCode || "OTHER"}
        otherLabel={noAccessReasonLookup.otherLabel || "Other"}
        loading={
          noAccessReasonLookup.isLoading || noAccessReasonLookup.isFetching
        }
        value={value}
        onChange={onChange}
        required={true}
        errorText={reasonErrorText}
        helperText="Reason comes from METER_NO_ACCESS_REASON lookup."
      />

      <View style={styles.mediaWrap}>
        <Text style={styles.mediaTitle}>No Access Evidence</Text>
        <Text style={styles.mediaDescription}>
          Capture a photo showing why access could not be obtained.
        </Text>

        <IrepsMedia
          name={mediaName}
          tag={mediaTag}
          agentName={agentName}
          agentUid={agentUid}
          fallbackGps={fallbackGps}
          required={true}
        />

        {!!mediaErrorText && (
          <Text style={styles.errorText}>{mediaErrorText}</Text>
        )}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },

  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
  },

  headerTextWrap: {
    flex: 1,
  },

  title: {
    color: "#991B1B",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  description: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 3,
  },

  noticeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },

  noticeText: {
    flex: 1,
    color: "#92400E",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
  },

  mediaWrap: {
    marginTop: 4,
  },

  mediaTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 3,
  },

  mediaDescription: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
    marginBottom: 6,
  },

  errorText: {
    color: "#DC2626",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 6,
  },
});
