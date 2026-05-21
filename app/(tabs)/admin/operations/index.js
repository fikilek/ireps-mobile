import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function OperationsHub() {
  const router = useRouter();

  const isNavigatingRef = useRef(false);
  const [isNavigating, setIsNavigating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      isNavigatingRef.current = false;
      setIsNavigating(false);
    }, []),
  );

  const handleNavigate = (href) => {
    if (isNavigatingRef.current) return;

    isNavigatingRef.current = true;
    setIsNavigating(true);

    router.push(href);
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.grid}>
          <OpCard
            title="WMS Dashboard"
            subtitle="Ward workorder control cockpit"
            icon="view-dashboard-outline"
            color="#1d4ed8"
            disabled={isNavigating}
            onPress={() => handleNavigate("/admin/operations/dashboard")}
          />
          <OpCard
            title="Operational Teams"
            subtitle="Personnel deployment & allocation"
            icon="account-group"
            color="#2563eb"
            disabled={isNavigating}
            onPress={() => handleNavigate("/admin/operations/teams")}
          />

          <OpCard
            title="My Workorders"
            subtitle="Accept, reject & execute assigned lifecycle TRNs"
            icon="clipboard-list-outline"
            color="#059669"
            disabled={isNavigating}
            onPress={() => handleNavigate("/admin/operations/my-workorders")}
          />

          <OpCard
            title="Geo-Fencing"
            subtitle="Geospatial work jurisdictions"
            icon="vector-polygon"
            color="#8b5cf6"
            disabled={isNavigating}
            onPress={() => handleNavigate("/admin/operations/geo-fences")}
          />

          <OpCard
            title="Field Analytics"
            subtitle="Deployment performance"
            icon="trending-up"
            color="#ea580c"
            disabled={isNavigating}
            onPress={() => handleNavigate("/admin/operations/field-analytics")}
          />

          <OpCard
            title="Revenue Analytics"
            subtitle="Analysis of LM prepaid revenues"
            icon="currency-usd"
            color="#0891b2"
            disabled={isNavigating}
            onPress={() =>
              handleNavigate("/admin/operations/revenue-analytics")
            }
          />

          <OpCard
            title="Quality Assurance"
            subtitle="Review & approve discovery docs"
            icon="shield-check"
            color="#ef4444"
            disabled={isNavigating}
            onPress={() =>
              handleNavigate("/admin/operations/quality-assurance")
            }
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const OpCard = ({ title, subtitle, icon, color, onPress, disabled }) => (
  <TouchableOpacity
    style={[styles.card, disabled && styles.cardDisabled]}
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.75}
  >
    <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
      <MaterialCommunityIcons name={icon} size={28} color={color} />
    </View>

    <Text style={styles.cardTitle}>{title}</Text>
    <Text style={styles.cardSubtitle}>{subtitle}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  scrollContent: {
    padding: 16,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  card: {
    backgroundColor: "#fff",
    width: "48%",
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },

  cardDisabled: {
    opacity: 0.5,
  },

  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },

  cardTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#1e293b",
    marginTop: 4,
  },

  cardSubtitle: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 4,
    lineHeight: 14,
    fontWeight: "500",
  },
});
