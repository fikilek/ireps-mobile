import { useEffect, useRef } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Portal, Surface, Text } from "react-native-paper";
import * as Haptics from "expo-haptics";
import { useAudioPlayer } from "expo-audio";

const SUCCESS_CHIME = require("../assets/audio/ward-erf-sync-success.wav");

function formatMs(ms) {
  if (!ms || ms < 0) return "0s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

function formatCount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

function formatRate(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0 ERFs/sec";
  return `${n.toFixed(1)} ERFs/sec`;
}

export default function WardErfsSyncDoneModal({
  visible = false,
  lmName = "LOCAL MUNICIPALITY",
  wardName = "WARD",
  durationMs = 0,
  totalDownloaded = 0,
  ratePerSecond = 0,
  onClose,
  onOpenWard,
}) {
  const playedRef = useRef(false);
  const successPlayer = useAudioPlayer(SUCCESS_CHIME);

  useEffect(() => {
    if (!visible) {
      playedRef.current = false;
      return;
    }

    if (playedRef.current) return;
    playedRef.current = true;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );

    try {
      successPlayer.seekTo(0);
      successPlayer.play();
    } catch (error) {
      console.log("WardErfsSyncDoneModal success chime failed", error);
    }
  }, [successPlayer, visible]);

  if (!visible) return null;

  return (
    <Portal>
      <View style={styles.mask}>
        <Surface style={styles.dialog} elevation={5}>
          <Text style={styles.title}>WARD ERF SYNC FINISHED</Text>

          <Text style={styles.thankYou}>Thank you for waiting.</Text>

          <Text style={styles.scopeText}>
            {lmName} • {wardName}
          </Text>

          <View style={styles.summaryCard}>
            <View style={styles.row}>
              <Text style={styles.label}>Duration</Text>
              <Text style={styles.value}>{formatMs(durationMs)}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Total ERFs Prepared</Text>
              <Text style={styles.value}>{formatCount(totalDownloaded)}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Average Sync Rate</Text>
              <Text style={styles.value}>{formatRate(ratePerSecond)}</Text>
            </View>
          </View>

          <View style={styles.messageCard}>
            <Text style={styles.messageText}>
              The selected ward ERF pack has been prepared and stored for faster
              operational access on this device.
            </Text>

            <Text style={styles.messageText}>
              This ward will remain available on the device until it is dropped
              from local storage or the app data is cleared.
            </Text>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}>
              <Text style={styles.secondaryBtnText}>CLOSE</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryBtn} onPress={onOpenWard}>
              <Text style={styles.primaryBtnText}>OPEN WARD</Text>
            </TouchableOpacity>
          </View>
        </Surface>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  mask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
    zIndex: 11000,
  },

  dialog: {
    width: "100%",
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    padding: 18,
  },

  title: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
  },

  thankYou: {
    marginTop: 10,
    fontSize: 14,
    color: "#2563EB",
    fontWeight: "800",
    textAlign: "center",
  },

  scopeText: {
    marginTop: 8,
    fontSize: 12,
    color: "#64748B",
    fontWeight: "800",
    textAlign: "center",
  },

  summaryCard: {
    marginTop: 18,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  label: {
    flex: 1,
    fontSize: 12,
    color: "#64748B",
    fontWeight: "700",
  },

  value: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "900",
    textAlign: "right",
  },

  messageCard: {
    marginTop: 16,
    backgroundColor: "#EFF6FF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    gap: 10,
  },

  messageText: {
    fontSize: 12,
    color: "#1E3A8A",
    lineHeight: 18,
  },

  buttonRow: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },

  secondaryBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#E2E8F0",
  },

  secondaryBtnText: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "900",
  },

  primaryBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#2563EB",
  },

  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
});
