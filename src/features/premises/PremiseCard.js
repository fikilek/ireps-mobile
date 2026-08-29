import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { memo } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useGeo } from "../../context/GeoContext";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  formatRepeatablePremiseIdentity,
  getDuplicateConfirmationMessage,
  isRepeatablePropertyType,
} from "./premiseRepeatability";

// 🛰️ BEACON SELECTOR: Visualizes property types instantly
const getPropertyBeacon = (type = "", occupancyStatus = "") => {
  const t = String(type || "").toLowerCase();
  const o = String(occupancyStatus || "").toLowerCase();

  if (t.includes("residential") && o.includes("under construction")) {
    return { name: "home-off-outline", color: "#f59e0b" };
  }

  if (t.includes("vacant land") || t.includes("land")) {
    return { name: "image-filter-hdr", color: "#84cc16" };
  }

  if (t.includes("church") || t.includes("religion")) {
    return { name: "church", color: "#6366f1" };
  }

  if (t.includes("school") || t.includes("education")) {
    return { name: "school", color: "#10b981" };
  }

  if (t.includes("township")) {
    return { name: "home-variant", color: "#f59e0b" };
  }

  if (t.includes("suburb")) {
    return { name: "home-city", color: "#3b82f6" };
  }

  if (t.includes("townhouse complex") || t.includes("townhouse")) {
    return { name: "home-group", color: "#94a3b8" };
  }

  if (t.includes("flat") || t.includes("sectional")) {
    return { name: "office-building", color: "#8b5cf6" };
  }

  if (t.includes("government") || t.includes("municipal")) {
    return { name: "domain", color: "#2563eb" };
  }

  if (t.includes("commercial") || t.includes("shop")) {
    return { name: "storefront", color: "#ec4899" };
  }

  if (t.includes("business")) {
    return { name: "storefront", color: "#ec4899" };
  }

  if (t.includes("industrial") || t.includes("factory")) {
    return { name: "factory", color: "#64748b" };
  }

  return { name: "home", color: "#94a3b8" };
};

// 🎗️ STATUS SELECTOR: Visualizes the current mission state
const getStatusConfig = (status = "") => {
  const s = status.toLowerCase();
  if (s.includes("audited") || s.includes("accessed"))
    return { label: "AUDITED", color: "#10B981", icon: "check-decagram" };
  if (s.includes("occupied") || s.includes("pending"))
    return { label: "PENDING", color: "#F59E0B", icon: "clock-outline" };
  if (s.includes("vandalised") || s.includes("no access"))
    return { label: "ALERT", color: "#EF4444", icon: "alert-octagon" };
  return { label: "NEW", color: "#94A3B8", icon: "plus-circle-outline" };
};

const normalizeMeterStatus = (meter) => {
  if (!meter) return "UNKNOWN";

  // Backward compatibility for old string arrays:
  // ["TRN_..."] has no status, so it needs attention.
  if (typeof meter === "string") {
    return "RECORDED";
  }

  return String(meter?.status || "UNKNOWN").toUpperCase();
};

const getServiceStatusIndicator = (meters = []) => {
  const list = Array.isArray(meters) ? meters : [];
  const count = list.length;

  if (count === 0) {
    return {
      count,
      icon: "minus-circle-outline",
      color: "#94a3b8",
      bg: "#f8fafc",
      border: "#e2e8f0",
      label: "NO METER",
    };
  }

  const statuses = list.map(normalizeMeterStatus);

  if (statuses.includes("DISCONNECTED")) {
    return {
      count,
      icon: "close-circle",
      color: "#dc2626",
      bg: "#fef2f2",
      border: "#fecaca",
      label: "ATTENTION",
    };
  }

  const hasNotConnected = statuses.some((status) => status !== "CONNECTED");

  if (hasNotConnected) {
    return {
      count,
      icon: "alert-circle",
      color: "#f59e0b",
      bg: "#fffbeb",
      border: "#fde68a",
      label: "CHECK",
    };
  }

  return {
    count,
    icon: "check-circle",
    color: "#16a34a",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    label: "OK",
  };
};

const PremiseCard = memo(
  ({
    item,
    wardNo,
    onMapPress,
    onDiscover,
    onInstall,
    onEditPress,
    onDuplicate,
    onNaPress,
    onAccountPress,
  }) => {
    const isRepeatable = isRepeatablePropertyType(
      item?.propertyType?.type,
    );
    const erfId = item?.erfId; // 🎯 The link to the sovereign

    const { updateGeo, geoState } = useGeo(); // 🛰️ THE COMMANDER
    const { all } = useWarehouse(); // 🕵️ THE INTEL

    const router = useRouter();

    const resolveEntityIdentity = () => {
      const type = item?.propertyType?.type || "";
      const name = item?.propertyType?.name || "";
      const unit = item?.propertyType?.unitNo || "";

      const repeatableIdentity = formatRepeatablePremiseIdentity(
        item?.propertyType,
      );
      if (repeatableIdentity) return repeatableIdentity;

      // Preserve existing named-entity identity outside repeatability scope.
      if (type === "Government") {
        if (name && unit) return `${name} | Unit ${unit}`;
        if (name) return name;
        if (unit) return `Unit ${unit}`;
        return "";
      }

      if (["Church", "School", "Business"].includes(type)) {
        return name || type;
      }

      return "";
    };

    // const beacon = getPropertyBeacon(propertyTypeStr);
    const status = getStatusConfig(item?.occupancy?.status || "");
    const occupancyStatus = item?.occupancy?.status || "Unknown";
    const noAccessTrnIds = Array.isArray(item?.noAccessTrnIds)
      ? item?.noAccessTrnIds.length
      : 0;

    const accountCount = Array.isArray(item?.accountRefs)
      ? item.accountRefs.length
      : 0;

    const electricityStatusIndicator = getServiceStatusIndicator(
      item?.services?.electricityMeters,
    );

    const waterStatusIndicator = getServiceStatusIndicator(
      item?.services?.waterMeters,
    );

    const identityLabel = resolveEntityIdentity();
    const addressStr =
      `${item?.address?.strNo || ""} ${item?.address?.strName || ""} ${item?.address?.strType || ""}`.trim();
    const beacon = getPropertyBeacon(
      item?.propertyType?.type,
      item?.occupancy?.status,
    );

    // 🏛️ THE DUPLICATE TRIGGER
    const handleDuplicate = () => {
      Alert.alert(
        "Duplicate Premise",
        getDuplicateConfirmationMessage(item?.propertyType?.type),
        [
          { text: "CANCEL", style: "cancel" },
          {
            text: "PROCEED",
            style: "default",
            onPress: () => onDuplicate?.(item),
          },
        ],
      );
    };

    const handleBeaconPress = () => {
      // 🕵️ 1. Find the parent Erf in the Warehouse
      const parentErf = all?.erfs?.find((e) => e.id === erfId);

      console.log(
        `📡 [Beacon Strike]: Locking GeoContext and Jumping to Erf: ${erfId}`,
      );

      // 🎯 TAP 1: Select the Erf (The Sovereign)
      updateGeo({
        selectedErf: parentErf || null,
        lastSelectionType: "ERF",
      });

      // 🎯 TAP 2: Select the Premise (The Target)
      updateGeo({
        selectedPremise: item,
        lastSelectionType: "PREMISE",
      });

      // 🚀 THE JUMP: Navigate to the Erfs Screen
      // This assumes your Erfs list is at /(tabs)/erfs/index.js
      router.push("/(tabs)/erfs");
    };

    const isSelected = geoState?.selectedPremise?.id === item?.id;

    const handleTogglePremiseSelection = () => {
      if (isSelected) {
        updateGeo({
          selectedPremise: null,
          lastSelectionType: null,
        });
        return;
      }

      updateGeo({
        selectedPremise: item,
        lastSelectionType: "PREMISE",
      });
    };

    const isErfSelected = geoState?.selectedErf?.id === erfId;

    const handleToggleErfSelection = () => {
      if (isErfSelected) {
        updateGeo({
          selectedErf: null,
          lastSelectionType: null,
        });
        return;
      }

      const parentErf = all?.erfs?.find((e) => e.id === erfId);

      updateGeo({
        selectedErf: parentErf || null,
        lastSelectionType: "ERF",
      });
    };

    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.9}>
        {/* 🎗️ STATUS RIBBON */}
        <View style={[styles.statusRibbon, { backgroundColor: status.color }]}>
          <MaterialCommunityIcons name={status.icon} size={12} color="white" />
          <Text style={styles.statusText}>{status.label}</Text>
        </View>

        <View style={styles.cardHeader}>
          {/* A tap on this GIANT icon selects erf and presmise and navigates to erfs */}
          <TouchableOpacity
            onPress={handleBeaconPress}
            activeOpacity={0.7}
            style={[
              styles.beaconContainer,
              { backgroundColor: `${beacon.color}15` },
            ]}
          >
            {/* 🛰️ THE GIANT BEACON */}
            <View
              style={[
                styles.beaconContainer,
                { backgroundColor: `${beacon.color}15` },
              ]}
            >
              <MaterialCommunityIcons
                name={beacon.name}
                size={32}
                color={beacon.color}
              />
            </View>
          </TouchableOpacity>

          <View style={styles.identityColumn}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                // paddingRight: 12,
              }}
            >
              <View>
                {/* Street Address */}
                <Pressable
                  onPress={handleTogglePremiseSelection}
                  style={({ pressed }) => [
                    styles.addressPressable,
                    pressed && styles.addressPressablePressed,
                    { backgroundColor: isSelected ? "lightgrey" : null },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: "#1E293B",
                    }}
                    numberOfLines={1}
                  >
                    {addressStr || "No Address"}
                  </Text>
                </Pressable>

                {/* Property Type */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    // marginTop: 4,
                  }}
                >
                  <Text style={styles.typeTagText} numberOfLines={1}>
                    {item?.propertyType?.type}
                  </Text>
                </View>

                {/* Ptoperty type name */}
                {identityLabel && (
                  <View style={{}}>
                    <Text
                      style={[styles.propertyTypeText, { color: beacon.color }]}
                    >
                      {`${identityLabel}`}
                    </Text>
                  </View>
                )}

                <View>
                  <Text style={{ fontSize: 10, fontWeight: "300" }}>
                    {occupancyStatus}
                  </Text>
                </View>
              </View>

              {/* COMPACT MAP PORTAL */}
              <View>
                <TouchableOpacity
                  style={{ justifyContent: `center`, alignItems: "center" }}
                  onPress={() => onMapPress?.(item)}
                >
                  <View style={styles.iconCircle}>
                    <MaterialCommunityIcons
                      name="map-search"
                      size={20}
                      color="#00BFFF"
                    />
                  </View>
                  <Text style={styles.mapLabel}>MAP</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 🎯 THE TARGET ROW: Now contains Erf, Ward, and the Edit Button */}
            <View style={styles.geoRow}>
              {/* Erf No */}
              <Pressable
                onPress={handleToggleErfSelection}
                style={({ pressed }) => [
                  styles.geoBadge,
                  styles.erfBadgePressable,
                  isErfSelected && styles.erfBadgeSelected,
                  pressed && styles.erfBadgePressed,
                ]}
              >
                <Text
                  style={[
                    styles.geoBadgeText,
                    isErfSelected && styles.erfBadgeTextSelected,
                  ]}
                >
                  {`Erf ${item?.erfNo || "N/A"}`}
                </Text>
              </Pressable>

              <Text style={styles.geoDivider}>•</Text>

              {/* Ward No */}
              <Text style={styles.geoBadge}>{`Ward ${wardNo || "?"}`}</Text>

              {/* EDIT Btn*/}
              <TouchableOpacity
                onPress={() => onEditPress?.(item)}
                style={styles.editIconBtn}
              >
                <MaterialCommunityIcons
                  name="square-edit-outline"
                  size={26}
                  color="#2563eb"
                />
              </TouchableOpacity>

              {/* 📸 THE MEDIA  */}
              <View style={styles.actionGroup}>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/premises/premiseMedia",
                      params: { premiseId: item.id },
                    })
                  }
                >
                  <MaterialCommunityIcons
                    name="camera-iris"
                    size={28}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>

              {/* 👯 THE DUPLICATE Btn: APPROVED REPEATABLE TYPES ONLY */}
              {isRepeatable && (
                <TouchableOpacity
                  onPress={handleDuplicate}
                  style={styles.duplicateIconBtn}
                >
                  <MaterialCommunityIcons
                    name="content-copy"
                    size={28}
                    color="#8b5cf6"
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* 🏛️ THE COMMAND STRIP */}
        <View style={styles.commandStrip}>
          <View style={styles.statsRow}>
            <View
              style={[
                styles.statItem,
                {
                  backgroundColor: electricityStatusIndicator.bg,
                  borderColor: electricityStatusIndicator.border,
                },
              ]}
            >
              <View style={styles.statTopRow}>
                <MaterialCommunityIcons
                  name="lightning-bolt"
                  size={16}
                  color="#EAB308"
                />
                <Text style={styles.statCount}>
                  {electricityStatusIndicator.count}
                </Text>
              </View>

              <View style={styles.statStatusRow}>
                <MaterialCommunityIcons
                  name={electricityStatusIndicator.icon}
                  size={13}
                  color={electricityStatusIndicator.color}
                />
                <Text
                  style={[
                    styles.statStatusText,
                    { color: electricityStatusIndicator.color },
                  ]}
                >
                  ELEC
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.statItem,
                {
                  backgroundColor: waterStatusIndicator.bg,
                  borderColor: waterStatusIndicator.border,
                },
              ]}
            >
              <View style={styles.statTopRow}>
                <MaterialCommunityIcons
                  name="water"
                  size={16}
                  color="#3B82F6"
                />
                <Text style={styles.statCount}>
                  {waterStatusIndicator.count}
                </Text>
              </View>

              <View style={styles.statStatusRow}>
                <MaterialCommunityIcons
                  name={waterStatusIndicator.icon}
                  size={13}
                  color={waterStatusIndicator.color}
                />
                <Text
                  style={[
                    styles.statStatusText,
                    { color: waterStatusIndicator.color },
                  ]}
                >
                  WTR
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.statItem,
                styles.accountStatItem,
              ]}
              onPress={() => onAccountPress?.(item)}
              activeOpacity={0.85}
            >
              <View style={styles.statTopRow}>
                <MaterialCommunityIcons
                  name="account"
                  size={16}
                  color="#7C3AED"
                />
                <Text style={styles.statCount}>{accountCount}</Text>
              </View>

              <View style={styles.statStatusRow}>
                <MaterialCommunityIcons
                  name="account-cash-outline"
                  size={13}
                  color="#7C3AED"
                />
                <Text style={[styles.statStatusText, { color: "#7C3AED" }]}>
                  ACC
                </Text>
              </View>
            </TouchableOpacity>

            {noAccessTrnIds > 0 && (
              <TouchableOpacity
                style={styles.compactNaBadge}
                onPress={() => onNaPress?.(item)}
              >
                <MaterialCommunityIcons
                  name="shield-alert-outline"
                  size={14}
                  color="#EA580C"
                />
                <Text style={styles.noAccessTrnIdsText}>{noAccessTrnIds}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.compactBtn, styles.btnDiscover]}
              onPress={() => onDiscover?.(item)}
            >
              <MaterialCommunityIcons
                name="magnify-scan"
                size={16}
                color="#1E293B"
              />
              <View>
                <Text style={styles.compactBtnText}>Discover</Text>
                <Text style={styles.compactBtnSubText}>Meter Audit</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.compactBtn, styles.btnInstall]}
              onPress={() => onInstall?.(item)}
            >
              <MaterialCommunityIcons
                name="plus-circle-outline"
                size={16}
                color="#FFF"
              />
              <Text style={[styles.compactBtnText, { color: "#FFF" }]}>
                Install
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  },
);

PremiseCard.displayName = "PremiseCard";

export default PremiseCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    paddingTop: 24,
    // marginBottom: 12,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    position: "relative",
    overflow: "hidden",
  },
  statusRibbon: {
    position: "absolute",
    top: 0,
    right: 0,
    borderBottomLeftRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    zIndex: 10,
  },
  statusText: {
    color: "white",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  beaconContainer: {
    width: 52,
    height: 52,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  identityColumn: { flex: 1, justifyContent: "center", gap: 6 },
  identityRow: { flexDirection: "row", alignItems: "center" },
  addressText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1E293B",
    maxWidth: "70%",
  },
  propertyTypeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  geoDivider: { color: "#CBD5E1", fontSize: 12 },
  mapAction: { alignItems: "center", marginLeft: 12, marginTop: 40 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F0FAFF",
    justifyContent: "center",
    alignItems: "center",
  },
  mapLabel: { fontSize: 9, fontWeight: "900", color: "#00BFFF", marginTop: 2 },
  commandStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 0.52 },
  // statItem: {
  //   flexDirection: "row",
  //   alignItems: "center",
  //   backgroundColor: "#F8FAFC",
  //   paddingHorizontal: 6,
  //   paddingVertical: 4,
  //   borderRadius: 6,
  //   gap: 2,
  // },
  // statCount: { fontSize: 12, fontWeight: "800", color: "#1E293B" },
  compactNaBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFEDD5",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FED7AA",
    gap: 2,
  },
  noAccessTrnIdsText: { fontSize: 12, fontWeight: "900", color: "#EA580C" },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 0.48,
    justifyContent: "flex-end",
  },
  compactBtn: {
    flexDirection: "row",
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    gap: 4,
  },
  btnDiscover: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  btnInstall: { backgroundColor: "#007AFF" },
  compactBtnText: { fontSize: 12, fontWeight: "800", color: "#1E293B" },
  compactBtnSubText: { fontSize: 8, fontWeight: "400", color: "#1E293B" },

  geoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center", // 🎯 Keeps icons and text vertically centered
    marginTop: 4,
    gap: 6, // 🎯 Ensures consistent spacing between badges
  },
  editIconBtn: {
    marginLeft: 4, // 🎯 Subtle distance from the Ward badge
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#eff6ff", // Light Blue tint
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: "#bfdbfe", // Subtle blue border for definition
    justifyContent: "center",
    alignItems: "center",
  },
  // geoBadge: {
  //   fontSize: 10, // 🎯 Slightly smaller for better fit on one line
  //   fontWeight: "800",
  //   color: "#64748B",
  //   backgroundColor: "#F1F5F9",
  //   paddingHorizontal: 6,
  //   paddingVertical: 1,
  //   borderRadius: 4,
  // },
  propertyType: {
    marginLeft: 10,
    fontSize: 12,
    color: "grey",
  },
  typeTag: {
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    marginLeft: 8,
    flexDirection: "column",
  },
  typeTagName: {
    fontSize: 10,
  },
  typeTagText: {
    fontSize: 12,
  },
  addressPressable: {
    borderRadius: 6,
    // paddingVertical: 2,
    // paddingHorizontal: 2,
  },

  addressPressablePressed: {
    opacity: 0.6,
  },

  geoBadge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "transparent",
  },

  geoBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
  },

  erfBadgePressable: {
    justifyContent: "center",
    alignItems: "center",
  },

  erfBadgeSelected: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },

  erfBadgePressed: {
    opacity: 0.7,
  },

  erfBadgeTextSelected: {
    color: "#2563eb",
  },

  statItem: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
  },

  accountStatItem: {
    backgroundColor: "#F5F3FF",
    borderColor: "#DDD6FE",
  },

  statTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },

  statStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    marginTop: 2,
  },

  statCount: {
    fontSize: 12,
    fontWeight: "900",
    color: "#1E293B",
  },

  statStatusText: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
});
