import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, useFocusEffect } from "expo-router";
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Surface,
  Text,
} from "react-native-paper";
import {
  useCallback,
  useMemo,
  useState,
} from "react";

import { INFORMAL_ERF_SITE_PHOTO_TAG } from "../../../../src/features/erfs/informalErfConstants";
import {
  clearInformalErfSubmissionQueue,
  getInformalErfSubmissionQueue,
  removeInformalErfQueueItem,
} from "../../../../src/utils/informalErfSubmissionQueue";

function toMillis(value) {
  const milliseconds =
    new Date(value || 0).getTime();

  return Number.isFinite(milliseconds)
    ? milliseconds
    : 0;
}

function formatDate(value) {
  if (!value || value === "NAv") {
    return "NAv";
  }

  try {
    return new Date(value).toLocaleString();
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

function getSitePhoto(payload = {}) {
  const media = Array.isArray(payload?.media)
    ? payload.media
    : [];

  return (
    media.find(
      (item) =>
        item?.tag ===
        INFORMAL_ERF_SITE_PHOTO_TAG,
    ) || null
  );
}

function statusColor(status) {
  if (status === "SUCCESS") return "#16A34A";
  if (status === "SYNCING") return "#2563EB";
  if (status === "FAILED") return "#DC2626";
  return "#0F172A";
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>
        {label}
      </Text>
      <Text style={styles.statValue}>
        {value}
      </Text>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  color,
  disabled,
  onPress,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        {
          backgroundColor:
            color || "#0F172A",
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={17}
        color="#FFFFFF"
      />
      <Text style={styles.actionButtonText}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function InformalErfQueueCard({
  item,
  busy,
  onRemove,
}) {
  const payload = item?.payload || {};
  const context = item?.context || {};
  const metadata = item?.metadata || {};
  const result = item?.result || {};
  const reason = payload?.reason || {};
  const proposed =
    payload?.proposedErfLocation || {};
  const device =
    payload?.deviceLocation || {};
  const status = String(
    item?.status || "PENDING",
  ).toUpperCase();

  const photo = getSitePhoto(payload);
  const photoUri =
    photo?.url || photo?.uri || null;

  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardTitle}>
            Informal ERF Request
          </Text>
          <Text
            style={styles.queueId}
            numberOfLines={1}
          >
            {item?.id || "NAv"}
          </Text>
        </View>

        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                statusColor(status),
            },
          ]}
        >
          <Text style={styles.statusText}>
            {status}
          </Text>
        </View>
      </View>

      <View style={styles.pillRow}>
        <View style={styles.pill}>
          <Text style={styles.pillLabel}>
            Workbase
          </Text>
          <Text
            style={styles.pillValue}
            numberOfLines={1}
          >
            {context?.lmName ||
              context?.lmPcode ||
              "NAv"}
          </Text>
        </View>

        <View style={styles.pill}>
          <Text style={styles.pillLabel}>
            Ward
          </Text>
          <Text
            style={styles.pillValue}
            numberOfLines={1}
          >
            {context?.wardName ||
              context?.wardPcode ||
              "NAv"}
          </Text>
        </View>
      </View>

      <Text style={styles.label}>Reason</Text>
      <Text style={styles.value}>
        {reason?.label ||
          reason?.code ||
          "NAv"}
      </Text>

      {reason?.otherText ? (
        <>
          <Text style={styles.label}>
            Other Reason
          </Text>
          <Text style={styles.value}>
            {reason.otherText}
          </Text>
        </>
      ) : null}

      <Text style={styles.label}>
        Proposed ERF GPS
      </Text>
      <Text style={styles.coordinateValue}>
        {formatCoordinate(proposed?.lat)},{" "}
        {formatCoordinate(proposed?.lng)}
      </Text>

      <Text style={styles.label}>
        Center Me GPS
      </Text>
      <Text style={styles.coordinateValue}>
        {formatCoordinate(device?.latitude)},{" "}
        {formatCoordinate(device?.longitude)}
      </Text>

      <Text style={styles.label}>
        Device Accuracy
      </Text>
      <Text style={styles.value}>
        {device?.accuracyM == null
          ? "NAv"
          : `${device.accuracyM} m`}
      </Text>

      <Text style={styles.label}>Saved</Text>
      <Text style={styles.value}>
        {formatDate(metadata?.createdAt)}
      </Text>

      <Text style={styles.label}>Saved By</Text>
      <Text style={styles.value}>
        {metadata?.createdByUser || "NAv"}
      </Text>

      {photoUri ? (
        <View style={styles.photoWrap}>
          <Image
            source={{ uri: photoUri }}
            style={styles.photo}
            resizeMode="cover"
          />
          <View style={styles.photoBadge}>
            <MaterialCommunityIcons
              name="camera-check-outline"
              size={14}
              color="#FFFFFF"
            />
            <Text style={styles.photoBadgeText}>
              SITE PHOTOGRAPH
            </Text>
          </View>
        </View>
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

      {result?.erfId &&
      result.erfId !== "NAv" ? (
        <>
          <Text style={styles.label}>
            Created ERF ID
          </Text>
          <Text style={styles.value}>
            {result.erfId}
          </Text>
        </>
      ) : null}

      {result?.message &&
      result.message !== "NAv" ? (
        <>
          <Text style={styles.label}>
            Last Result
          </Text>
          <Text style={styles.value}>
            {result.message}
          </Text>
        </>
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
    </Surface>
  );
}

export default function InformalErfSubmissionQueueScreen() {
  const [queueItems, setQueueItems] =
    useState([]);
  const [refreshing, setRefreshing] =
    useState(false);
  const [busy, setBusy] =
    useState(false);

  const counts = useMemo(() => {
    const initial = {
      all: 0,
      pending: 0,
      syncing: 0,
      success: 0,
    };

    return queueItems.reduce(
      (totals, item) => {
        const status = String(
          item?.status || "PENDING",
        ).toUpperCase();

        totals.all += 1;

        if (status === "SUCCESS") {
          totals.success += 1;
        } else if (status === "SYNCING") {
          totals.syncing += 1;
        } else {
          totals.pending += 1;
        }

        return totals;
      },
      initial,
    );
  }, [queueItems]);

  const loadQueue = useCallback(async () => {
    try {
      const queue =
        await getInformalErfSubmissionQueue();

      const sorted = (
        Array.isArray(queue) ? queue : []
      ).sort(
        (a, b) =>
          toMillis(
            b?.metadata?.updatedAt ||
              b?.metadata?.createdAt,
          ) -
          toMillis(
            a?.metadata?.updatedAt ||
              a?.metadata?.createdAt,
          ),
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
      loadQueue();
    }, [loadQueue]),
  );

  const handleRefresh =
    useCallback(async () => {
      setRefreshing(true);
      await loadQueue();
      setRefreshing(false);
    }, [loadQueue]);

  const handleRemove =
    useCallback(
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

                const result =
                  await removeInformalErfQueueItem(
                    item.id,
                  );

                await loadQueue();
                setBusy(false);

                ToastAndroid.show(
                  result?.message ||
                    "Informal ERF item removed.",
                  result?.success
                    ? ToastAndroid.SHORT
                    : ToastAndroid.LONG,
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

            const result =
              await clearInformalErfSubmissionQueue();

            await loadQueue();
            setBusy(false);

            ToastAndroid.show(
              result?.message ||
                "Informal ERF queue cleared.",
              result?.success
                ? ToastAndroid.SHORT
                : ToastAndroid.LONG,
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
      >
        <Surface
          style={styles.headerCard}
          elevation={1}
        >
          <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <MaterialCommunityIcons
                name="map-marker-plus-outline"
                size={25}
                color="#0F172A"
              />
            </View>

            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>
                Informal ERF Local Storage
              </Text>
              <Text style={styles.headerSubtitle}>
                Requests saved on this device before backend submission.
              </Text>
            </View>
          </View>

          <View style={styles.countStrip}>
            <Stat
              label="All"
              value={counts.all}
            />
            <View style={styles.divider} />
            <Stat
              label="Pending"
              value={counts.pending}
            />
            <View style={styles.divider} />
            <Stat
              label="Syncing"
              value={counts.syncing}
            />
            <View style={styles.divider} />
            <Stat
              label="Success"
              value={counts.success}
            />
          </View>

          <View style={styles.headerActions}>
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
              disabled={
                busy ||
                queueItems.length === 0
              }
              onPress={handleClear}
            />
          </View>

          <View style={styles.syncNotice}>
            <MaterialCommunityIcons
              name="cloud-off-outline"
              size={18}
              color="#92400E"
            />
            <Text style={styles.syncNoticeText}>
              Local storage only. Sync will be enabled after the Informal ERF callable is connected.
            </Text>
          </View>
        </Surface>

        {queueItems.length === 0 ? (
          <Surface
            style={styles.emptyCard}
            elevation={1}
          >
            <MaterialCommunityIcons
              name="map-marker-off-outline"
              size={34}
              color="#94A3B8"
            />
            <Text style={styles.emptyTitle}>
              No Informal ERFs Stored
            </Text>
            <Text style={styles.emptyText}>
              Submitted Informal ERF forms will appear here while waiting for backend submission.
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
    paddingHorizontal: 8,
  },

  stat: {
    flex: 1,
    alignItems: "center",
  },

  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
  },

  statValue: {
    marginTop: 3,
    fontSize: 18,
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
    gap: 8,
  },

  syncNotice: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#FEF3C7",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },

  syncNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: "#92400E",
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

  queueId: {
    marginTop: 3,
    fontSize: 9,
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
    height: 190,
    marginTop: 14,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
  },

  photo: {
    width: "100%",
    height: "100%",
  },

  photoBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
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
});
