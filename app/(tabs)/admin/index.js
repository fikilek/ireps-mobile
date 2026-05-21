import { useAuth } from "@/src/hooks/useAuth";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

/* ---------------- UI Helpers ---------------- */

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Card({ title, subtitle, onPress, disabled }) {
  return (
    <Pressable
      style={[styles.card, disabled && styles.cardDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

/* ---------------- Main ---------------- */

export default function AdminDashboard() {
  const router = useRouter();
  const { isSPU, isADM, isMNG, isSPV, isFWR } = useAuth();

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
    <ScrollView style={styles.container}>
      <Section title="Operational Management">
        {(isSPU || isADM || isMNG || isFWR || isSPV) && (
          <Card
            title="Service Providers"
            subtitle="View & manage contractors"
            disabled={isNavigating}
            onPress={() => handleNavigate("/(tabs)/admin/service-providers")}
          />
        )}

        {(isSPU || isADM || isMNG || isFWR || isSPV) && (
          <Card
            title="User"
            subtitle="View platform a user"
            disabled={isNavigating}
            onPress={() => handleNavigate("/(tabs)/admin/user")}
          />
        )}

        {(isSPU || isADM || isMNG || isSPV) && (
          <Card
            title="Users"
            subtitle="View platform users"
            disabled={isNavigating}
            onPress={() => handleNavigate("/(tabs)/admin/users")}
          />
        )}

        {(isSPU || isADM || isMNG) && (
          <Card
            title="Pending Authorizations"
            subtitle="Review and mobilise new recruits"
            disabled={isNavigating}
            onPress={() => handleNavigate("/admin/pendingUsers")}
          />
        )}
      </Section>

      {(isSPU || isADM) && (
        <Section title="System Configuration">
          <Card
            title="Dropdown Settings"
            subtitle="Manage meter types, anomalies & manufacturers"
            disabled={isNavigating}
            onPress={() => handleNavigate("/(tabs)/admin/settings")}
          />
        </Section>
      )}

      {(isSPU || isADM || isMNG || isSPV || isFWR) && (
        <Section title="Reporting & Intelligence">
          <Card
            title="Management Reports"
            subtitle="Financial, Operational & User Reports"
            disabled={isNavigating}
            onPress={() => handleNavigate("/(tabs)/admin/reports")}
          />

          <Card
            title="Operations Management Center"
            subtitle="Workorder allocation, FW teams etc"
            disabled={isNavigating}
            onPress={() => handleNavigate("/(tabs)/admin/operations")}
          />
        </Section>
      )}

      {(isSPU || isADM || isMNG || isSPV || isFWR) && (
        <Section title="Local Storage">
          <Card
            title="Ward ERFs Storage"
            subtitle="Ward ERFs sync & management"
            disabled={isNavigating}
            onPress={() =>
              handleNavigate("/(tabs)/admin/storage/ward-erfs-sync")
            }
          />

          <Card
            title="Meter Discovery Forms Storage"
            subtitle="Offline Meter Audit forms queue"
            disabled={isNavigating}
            onPress={() =>
              handleNavigate("/(tabs)/admin/storage/forms-submission-queue")
            }
          />

          <Card
            title="Sales Storage"
            subtitle="Offline Sales data"
            disabled={isNavigating}
            onPress={() => handleNavigate("/(tabs)/admin/storage/sales-sync")}
          />

          <Card
            title="Premise Forms Storage"
            subtitle="Offline Premise submission queue"
            disabled={isNavigating}
            onPress={() =>
              handleNavigate("/(tabs)/admin/storage/premise-offline-storage")
            }
          />
        </Section>
      )}
    </ScrollView>
  );
}

/* ---------------- Styles ---------------- */

const styles = StyleSheet.create({
  container: { padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  card: {
    backgroundColor: "#f5f5f5",
    padding: 14,
    borderRadius: 8,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardSubtitle: { fontSize: 13, color: "#666", marginTop: 2 },
  cardDisabled: {
    opacity: 0.5,
  },
});
