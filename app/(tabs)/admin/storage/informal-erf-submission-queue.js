import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, useFocusEffect } from "expo-router";
import {
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import { Surface, Text } from "react-native-paper";
import { useCallback, useMemo, useState } from "react";

import { INFORMAL_ERF_SITE_PHOTO_TAG } from "../../../../src/features/erfs/informalErfConstants";
import { useAuth } from "../../../../src/hooks/useAuth";
import { processInformalErfSubmissionQueue } from "../../../../src/services/startInformalErfQueueSyncService";
import {
  clearInformalErfSubmissionQueue,
  getInformalErfSubmissionQueue,
  removeInformalErfQueueItem,
} from "../../../../src/utils/informalErfSubmissionQueue";

const INFORMAL_ERF_REASON_LABELS = Object.freeze({
  NO_FORMAL_ERF: "No formal ERF exists at this location",
  UNMAPPED_INFORMAL_AREA: "Structure is in an unmapped informal area",
  METER_OUTSIDE_MAPPED_ERF: "Meter is outside mapped ERFs",
  SERVICE_CONNECTION_WITHOUT_ERF:
    "Service connection has no matching ERF",
  CADASTRAL_DATA_INCOMPLETE: "Cadastral information is incomplete",
  FORMAL_ERF_NOT_IDENTIFIABLE:
    "Correct formal ERF cannot be identified",
  OTHER: "Other",
});

function toMillis(value) {
  if (typeof value?.toMillis === "function") {
    const milliseconds = value.toMillis();
    return Number.isFinite(milliseconds) ? milliseconds : 0;
  }

  const direct = Number(value);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const milliseconds = new Date(value || 0).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : 0;
}

function formatDate(value) {
  const milliseconds = toMillis(value);

  if (!milliseconds) return "NAv";

  try {
    return new Date(milliseconds).toLocaleString();
  } catch (_error) {
    return "NAv";
  }
}

function formatCoordinate(value) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue)
    ? numberValue.toFixed(6)
    : "NAv";
}

function formatAccuracy(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? `${numberValue.toFixed(1)} m` : "NAv";
}

function getReasonLabel(reasonCode) {
  const cleanCode = String(reasonCode || "").trim().toUpperCase();
  return INFORMAL_ERF_REASON_LABELS[cleanCode] || cleanCode || "NAv";
}

function getSitePhoto(payload = {}) {
  const media = Array.isArray(payload?.media) ? payload.media : [];

  return (
    media.find((item) => item?.tag === INFORMAL_ERF_SITE_PHOTO_TAG) ||
    null
  );
}

function getPhotoCapturedAt(photo = {}) {
  return (
    photo?.capturedAtMs ||
    photo?.created?.at ||
    photo?.metadata?.createdAt ||
    null
  );
}

function statusColor(status) {
  if (status === "SUCCESS") return "#16A34A";
  if (status === "SYNCING") return "#2563EB";
  if (status === "REJECTED" || status === "FAILED") return "#DC2626";
  return "#B45309";
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function ActionButton({ icon, label, color, disabled, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        {
          backgroundColor: color || "#0F172A",
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={17}
        color="#FFFFFF"
      />
      <Text style={styles.actionButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function FieldValue({ label, children, coordinate = false }) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <Text style={coordinate ? styles.coordinateValue : styles.value}>
        {children}
      </Text>
    </>
  );
}

function InformalErfQueueCard({ item, busy, onRemove }) {
  const [isPhotoOpen, setIsPhotoOpen] = useState(false);

  const payload = item?.payload || {};
  const context = item?.context || {};
  const metadata = item?.metadata || {};
  const result = item?.result || {};
  const device = payload?.deviceLocation || {};
  const boundaryPoints = Array.isArray(payload?.boundaryPoints)
    ? payload.boundaryPoints
    : [];
  const status = String(item?.status || "PENDING").toUpperCase();

  const photo = getSitePhoto(payload);
  const photoUri = photo?.url || photo?.uri || null;
  const photoGps = photo?.gps || null;

  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardTitle}>Informal ERF Request</Text>
          <Text style={styles.erfId} numberOfLines={1}>
            {payload?.erfId || result?.erfId || "NAv"}
          </Text>
          <Text style={styles.queueId} numberOfLines={1}>
            Queue: {item?.id || "NAv"}
          </Text>
        </View>

        <View
          style={[
            styles.statusBadge,
            { backgroundColor: statusColor(status) },
          ]}
        >
          <Text style={styles.statusText}>{status}</Text>
        </View>
      </View>

      <View style={styles.pillRow}>
        <View style={styles.pill}>
          <Text style={styles.pillLabel}>Workbase</Text>
          <Text style={styles.pillValue} numberOfLines={1}>
            {context?.lmName || context?.lmPcode || payload?.lmPcode || "NAv"}
          </Text>
        </View>

        <View style={styles.pill}>
          <Text style={styles.pillLabel}>Ward</Text>
          <Text style={styles.pillValue} numberOfLines={1}>
            {context?.wardName ||
              context?.wardPcode ||
              payload?.wardPcode ||
              "NAv"}
          </Text>
        </View>
      </View>

      <FieldValue label="Reason">
        {getReasonLabel(payload?.reasonCode)}
      </FieldValue>

      {payload?.reasonOther ? (
        <FieldValue label="Other Reason">{payload.reasonOther}</FieldValue>
      ) : null}

      <FieldValue label="Boundary Points">
        {String(boundaryPoints.length)}
      </FieldValue>

      <FieldValue label="Device GPS (Forensic)" coordinate>
        {formatCoordinate(device?.latitude)}, {formatCoordinate(device?.longitude)}
      </FieldValue>

      <FieldValue label="Device Accuracy">
        {formatAccuracy(device?.accuracyM)}
      </FieldValue>

      <FieldValue label="Photo GPS" coordinate>
        {formatCoordinate(photoGps?.lat)}, {formatCoordinate(photoGps?.lng)}
      </FieldValue>

      <FieldValue label="Photo Captured">
        {formatDate(getPhotoCapturedAt(photo))}
      </FieldValue>

      <FieldValue label="Saved">{formatDate(metadata?.createdAtMs || metadata?.createdAt)}</FieldValue>
      <FieldValue label="Saved By">{metadata?.createdByUser || "NAv"}</FieldValue>

      {photoUri ? (
        <TouchableOpacity
          style={styles.photoWrap}
          activeOpacity={0.9}
          onPress={() => setIsPhotoOpen(true)}
        >
          <Image
            source={{ uri: photoUri }}
            style={styles.photo}
            resizeMode="contain"
          />
          <View style={styles.photoBadge}>
            <MaterialCommunityIcons
              name="camera-check-outline"
              size={14}
              color="#FFFFFF"
            />
            <Text style={styles.photoBadgeText}>FORENSIC PHOTOGRAPH</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.photoMissing}>
          <MaterialCommunityIcons
            name="camera-off-outline"
            size={24}
            color="#94A3B8"
          />
          <Text style={styles.photoMissingText}>
            Site photograph is unavailable.
          </Text>
        </View>
      )}

      {photoUri ? (
        <Text style={styles.photoHint}>
          Tap the photograph to view the full iREPS forensic inscription.
        </Text>
      ) : null}

      {result?.parcelNo && result.parcelNo !== "NAv" ? (
        <FieldValue label="Created ERF Number">{result.parcelNo}</FieldValue>
      ) : null}

      {result?.message && result.message !== "NAv" ? (
        <FieldValue label="Last Result">{result.message}</FieldValue>
      ) : null}

      <View style={styles.cardActions}>
        <ActionButton
          icon="delete-outline"
          label="Remove"
          color="#DC2626"
          disabled={busy}
          onPress={() => onRemove(item)}
        />
      </View>

      <Modal
        visible={isPhotoOpen}
        animationType="fade"
        transparent={false}
        onRequestClose={() => setIsPhotoOpen(false)}
      >
        <View style={styles.fullScreenPhotoContainer}>
          <Image
            source={{ uri: photoUri }}
            style={styles.fullScreenPhoto}
            resizeMode="contain"
          />

          <TouchableOpacity
            style={styles.closePhotoButton}
            activeOpacity={0.85}
            onPress={() => setIsPhotoOpen(false)}
          >
            <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
            <Text style={styles.closePhotoText}>CLOSE</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </Surface>
  );
}

export default function InformalErfSubmissionQueueScreen() {
  const { user, profile } = useAuth();
  const [queueItems, setQueueItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const agentUid = user?.uid || "";
  const agentName =
    profile?.profile?.displayName ||
    [profile?.profile?.name, profile?.profile?.surname]
      .filter(Boolean)
      .join(" ") ||
    user?.displayName ||
    "iREPS User";

  const counts = useMemo(() => {
    const initial = {
      all: 0,
      pending: 0,
      syncing: 0,
      success: 0,
      rejected: 0,
    };

    return queueItems.reduce((totals, item) => {
      const status = String(item?.status || "PENDING").toUpperCase();

      totals.all += 1;

      if (status === "SUCCESS") {
        totals.success += 1;
      } else if (status === "SYNCING") {
        totals.syncing += 1;
      } else if (status === "REJECTED" || status === "FAILED") {
        totals.rejected += 1;
      } else {
        totals.pending += 1;
      }

      return totals;
    }, initial);
  }, [queueItems]);

  const loadQueue = useCallback(async () => {
    try {
      const queue = await getInformalErfSubmissionQueue();

      const sorted = [...(Array.isArray(queue) ? queue : [])].sort(
        (a, b) =>
          toMillis(b?.metadata?.updatedAtMs || b?.metadata?.updatedAt) -
          toMillis(a?.metadata?.updatedAtMs || a?.metadata?.updatedAt),
      );

      setQueueItems(sorted);
    } catch (error) {
      console.log(
        "InformalErfSubmissionQueueScreen -- loadQueue error",
        error,
      );

      ToastAndroid.show(
        "Failed to load Informal ERF local storage.",
        ToastAndroid.LONG,
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadQueue();
    }, [loadQueue]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadQueue();
    setRefreshing(false);
  }, [loadQueue]);

  const handleSyncNow = useCallback(async () => {
    if (!agentUid) {
      ToastAndroid.show(
        "Sign in before syncing Informal ERFs.",
        ToastAndroid.LONG,
      );
      return;
    }

    setBusy(true);

    try {
      const result = await processInformalErfSubmissionQueue({
        agentUid,
        agentName,
      });

      await loadQueue();

      ToastAndroid.show(
        result?.message || "Informal ERF queue processing completed.",
        result?.success ? ToastAndroid.SHORT : ToastAndroid.LONG,
      );
    } catch (error) {
      console.error("Informal ERF manual sync failed.", error);
      ToastAndroid.show(
        error?.message || "Informal ERF sync failed.",
        ToastAndroid.LONG,
      );
    } finally {
      setBusy(false);
    }
  }, [agentName, agentUid, loadQueue]);

  const handleRemove = useCallback(
    (item) => {
      if (!item?.id) return;

      Alert.alert(
        "Remove Informal ERF",
        "Remove this locally saved Informal ERF request?",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              setBusy(true);

              const result = await removeInformalErfQueueItem(item.id);

              await loadQueue();
              setBusy(false);

              ToastAndroid.show(
                result?.message || "Informal ERF item removed.",
                result?.success ? ToastAndroid.SHORT : ToastAndroid.LONG,
              );
            },
          },
        ],
      );
    },
    [loadQueue],
  );

  const handleClear = useCallback(() => {
    if (queueItems.length === 0) return;

    Alert.alert(
      "Clear Informal ERF Queue",
      "Remove every Informal ERF request stored on this device?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Clear Queue",
          style: "destructive",
          onPress: async () => {
            setBusy(true);

            const result = await clearInformalErfSubmissionQueue();

            await loadQueue();
            setBusy(false);

            ToastAndroid.show(
              result?.message || "Informal ERF queue cleared.",
              result?.success ? ToastAndroid.SHORT : ToastAndroid.LONG,
            );
          },
        },
      ],
    );
  }, [loadQueue, queueItems.length]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Informal ERF Queue",
          headerTitleStyle: {
            fontSize: 16,
            fontWeight: "900",
          },
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <Surface style={styles.headerCard} elevation={1}>
          <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <MaterialCommunityIcons
                name="map-marker-plus-outline"
                size={25}
                color="#0F172A"
              />
            </View>

            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>Informal ERF Local Queue</Text>
              <Text style={styles.headerSubtitle}>
                Pending requests are retained on this device until the backend
                accepts or rejects them.
              </Text>
            </View>
          </View>

          <View style={styles.countStrip}>
            <Stat label="All" value={counts.all} />
            <View style={styles.divider} />
            <Stat label="Pending" value={counts.pending} />
            <View style={styles.divider} />
            <Stat label="Syncing" value={counts.syncing} />
            <View style={styles.divider} />
            <Stat label="Success" value={counts.success} />
            <View style={styles.divider} />
            <Stat label="Rejected" value={counts.rejected} />
          </View>

          <View style={styles.headerActions}>
            <ActionButton
              icon="cloud-sync-outline"
              label="Sync Now"
              color="#2563EB"
              disabled={busy || queueItems.length === 0}
              onPress={handleSyncNow}
            />

            <ActionButton
              icon="refresh"
              label="Refresh"
              color="#0F172A"
              disabled={busy}
              onPress={handleRefresh}
            />

            <ActionButton
              icon="delete-sweep-outline"
              label="Clear"
              color="#DC2626"
              disabled={busy || queueItems.length === 0}
              onPress={handleClear}
            />
          </View>

          <View style={styles.syncNotice}>
            <MaterialCommunityIcons
              name="cloud-check-outline"
              size={18}
              color="#1D4ED8"
            />
            <Text style={styles.syncNoticeText}>
              Pending items retry automatically when their original creator is
              signed in and internet access is available.
            </Text>
          </View>
        </Surface>

        {queueItems.length === 0 ? (
          <Surface style={styles.emptyCard} elevation={1}>
            <MaterialCommunityIcons
              name="map-marker-off-outline"
              size={34}
              color="#94A3B8"
            />
            <Text style={styles.emptyTitle}>No Informal ERFs Stored</Text>
            <Text style={styles.emptyText}>
              Only genuinely offline or temporary failures are saved here.
              Successful online submissions are not placed in the local queue.
            </Text>
          </Surface>
        ) : (
          queueItems.map((item) => (
            <InformalErfQueueCard
              key={item?.id}
              item={item}
              busy={busy}
              onRemove={handleRemove}
            />
          ))
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },
  content: {
    padding: 12,
    paddingBottom: 40,
  },
  headerCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
  },
  countStrip: {
    marginTop: 14,
    minHeight: 64,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#64748B",
  },
  statValue: {
    marginTop: 3,
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  divider: {
    width: 1,
    height: 34,
    backgroundColor: "#E2E8F0",
  },
  headerActions: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  syncNotice: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#DBEAFE",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  syncNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: "#1E40AF",
    fontWeight: "700",
  },
  card: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardTitleWrap: {
    flex: 1,
    paddingRight: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A",
  },
  erfId: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "800",
    color: "#334155",
  },
  queueId: {
    marginTop: 2,
    fontSize: 8,
    color: "#94A3B8",
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  pillRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  pill: {
    flex: 1,
    padding: 9,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
  },
  pillLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94A3B8",
  },
  pillValue: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "800",
    color: "#334155",
  },
  label: {
    marginTop: 12,
    fontSize: 9,
    fontWeight: "900",
    color: "#94A3B8",
    textTransform: "uppercase",
  },
  value: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: "#334155",
  },
  coordinateValue: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
  },
  photoWrap: {
    height: 300,
    marginTop: 14,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0F172A",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoBadge: {
    position: "absolute",
    left: 8,
    top: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(15,23,42,0.82)",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  photoBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  photoHint: {
    marginTop: 6,
    fontSize: 10,
    lineHeight: 15,
    color: "#64748B",
    textAlign: "center",
  },
  photoMissing: {
    height: 100,
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  photoMissingText: {
    fontSize: 10,
    color: "#94A3B8",
    fontWeight: "700",
  },
  cardActions: {
    marginTop: 14,
    flexDirection: "row",
  },
  actionButton: {
    minHeight: 42,
    minWidth: 96,
    borderRadius: 9,
    paddingHorizontal: 12,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionButtonText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  emptyCard: {
    padding: 26,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: "900",
    color: "#0F172A",
  },
  emptyText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
    textAlign: "center",
  },
  fullScreenPhotoContainer: {
    flex: 1,
    backgroundColor: "#020617",
    justifyContent: "center",
    alignItems: "center",
  },
  fullScreenPhoto: {
    width: "100%",
    height: "100%",
  },
  closePhotoButton: {
    position: "absolute",
    top: 44,
    right: 16,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: "rgba(15,23,42,0.9)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  closePhotoText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#FFFFFF",
  },
});
