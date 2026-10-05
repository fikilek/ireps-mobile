import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityIndicator, Modal, Portal } from "react-native-paper";

// 🎯 Data Layer
import { useWarehouse } from "../../../src/context/WarehouseContext";
import { noAccessLedgerDetails } from "../../../src/features/meters/noAccessLedger";
import { useGetTrnsByPremiseIdQuery } from "../../../src/redux/trnsApi";

const NaScreen = () => {
  console.log(`NaScreen ---mounted`);
  const router = useRouter();
  const { premiseId } = useLocalSearchParams();
  const { all } = useWarehouse();

  const premise = all?.prems?.find((p) => p.id === premiseId);

  const { data: trns, isLoading } = useGetTrnsByPremiseIdQuery(
    { premiseId },
    { skip: !premiseId },
  );

  const noAccessTrns = Array.isArray(trns)
    ? trns.filter((trn) => trn?.accessData?.access?.hasAccess === "no")
    : [];

  const [selectedImage, setSelectedImage] = useState(null);

  const erfNo = premise?.erfNo || "N/A";
  const fullAddr =
    `${premise?.address?.strNo || ""} ${premise?.address?.strName || ""} ${premise?.address?.strType || ""}`.trim();

  const renderItem = ({ item }) => {
    const access = item?.accessData?.access || {};

    const media = Array.isArray(item?.media)
      ? item.media.find((m) => m?.tag === "noAccessPhoto")
      : null;

    const details = noAccessLedgerDetails(item);

    return (
      <View style={styles.row}>
        {/* COL 1: TIMESTAMP */}
        <View style={styles.colTime}>
          <Text style={styles.visitLabel}>Visit</Text>
          <Text style={styles.dateText}>{details.visitDate}</Text>
          <Text style={styles.timeText}>{details.visitTime}</Text>
        </View>

        {/* COL 2: REASON */}
        <View style={styles.colReason}>
          <Text style={styles.reasonText}>
            {access?.reason || "Unknown Reason"}
          </Text>
          <Text style={styles.agentText}>By: {details.worker}</Text>
          <Text style={styles.appointmentText}>{details.appointment}</Text>
        </View>

        {/* COL 3: THUMBNAIL */}
        <View style={styles.colPhoto}>
          {media?.url ? (
            <TouchableOpacity onPress={() => setSelectedImage(media.url)}>
              <Image source={{ uri: media.url }} style={styles.thumbnail} />
            </TouchableOpacity>
          ) : (
            <MaterialCommunityIcons
              name="image-off-outline"
              size={24}
              color="#cbd5e1"
            />
          )}
        </View>
      </View>
    );
  };

  if (isLoading)
    return <ActivityIndicator style={{ flex: 1 }} color="#0f172a" />;

  return (
    <View style={styles.container}>
      {/* 🏛️ HEADER SECTION */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={32}
            color="#0f172a"
          />
        </TouchableOpacity>

        <View style={styles.headerBadge}>
          <Text style={styles.erfLabel}>ERF {erfNo}</Text>
        </View>
        <Text style={styles.addressLabel} numberOfLines={1}>
          {fullAddr}
        </Text>
      </View>

      <FlatList
        data={noAccessTrns}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={
          <Text style={styles.empty}>No Access records found.</Text>
        }
        contentContainerStyle={styles.listContent}
      />

      {/* 🖼️ PHOTO MODAL */}
      <Portal>
        <Modal
          visible={!!selectedImage}
          onDismiss={() => setSelectedImage(null)}
          contentContainerStyle={styles.modalContent}
        >
          <TouchableOpacity
            style={styles.modalCloseBtn}
            onPress={() => setSelectedImage(null)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="close" size={24} color="#fff" />
          </TouchableOpacity>

          {selectedImage && (
            <Image
              source={{ uri: selectedImage }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
        </Modal>
      </Portal>
    </View>
  );
};

export default NaScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    paddingTop: 60, // 🛡️ Safe area adjustment
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: { marginLeft: -10, marginRight: 5 },
  headerBadge: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 12,
  },
  erfLabel: { color: "#fff", fontWeight: "900", fontSize: 12 },
  addressLabel: { fontSize: 14, fontWeight: "700", color: "#334155", flex: 1 },

  listContent: { padding: 16 },
  row: {
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  colTime: { width: 85 },
  visitLabel: { fontSize: 10, color: "#64748b", marginBottom: 2 },
  dateText: { fontSize: 11, fontWeight: "900", color: "#64748b" },
  timeText: { fontSize: 10, color: "#94a3b8" },

  colReason: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
  reasonText: { fontSize: 13, fontWeight: "800", color: "#1e293b" },
  agentText: { fontSize: 10, color: "#64748b", marginTop: 2 },
  appointmentText: { fontSize: 11, lineHeight: 16, color: "#0f766e", marginTop: 6 },

  colPhoto: { width: 60, alignItems: "flex-end" },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
  },

  modalContent: {
    backgroundColor: "black",
    padding: 10,
    margin: 20,
    borderRadius: 12,
    height: "70%",
  },
  fullImage: { width: "100%", height: "100%" },
  empty: {
    textAlign: "center",
    marginTop: 40,
    color: "#94a3b8",
    fontWeight: "700",
  },

  modalCloseBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
});
