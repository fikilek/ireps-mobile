import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "react-native-paper";
import { useAuth } from "@/src/hooks/useAuth";

function StorageCard({ title, subtitle, icon, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name={icon} size={24} color="#0f172a" />
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
        </View>

        <MaterialCommunityIcons
          name="chevron-right"
          size={24}
          color="#94a3b8"
        />
      </View>
    </TouchableOpacity>
  );
}

export default function LocalStorageScreen() {
  const router = useRouter();
  const { isSPU, isADM, isMNG, isSPV, isFWR } = useAuth();

  const canViewStorage = isSPU || isADM || isMNG || isSPV || isFWR;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Local Storage",
          headerTitleStyle: { fontSize: 16, fontWeight: "900" },
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <MaterialCommunityIcons
              name="database-cog-outline"
              size={22}
              color="#0f172a"
            />
            <Text style={styles.heroTitle}>Offline Storage Management</Text>
          </View>

          <Text style={styles.heroSubtitle}>
            Manage prepaid sales sync, queued meter forms, and data cleansing
            account data. Ward ERFs are managed from the ERFs ward selector.
          </Text>
        </View>

        {canViewStorage ? (
          <View style={styles.cardsWrap}>
            <StorageCard
              title="Sales Sync"
              subtitle="Download monthly prepaid sales to this device"
              icon="database-arrow-down-outline"
              onPress={() => router.push("/(tabs)/admin/storage/sales-sync")}
            />

            <StorageCard
              title="Forms Storage"
              subtitle="Offline meter/TRN forms submission queue"
              icon="file-document-outline"
              onPress={() =>
                router.push("/(tabs)/admin/storage/forms-submission-queue")
              }
            />

            <StorageCard
              title="Account Data Queue"
              subtitle="Data Cleansing FormAccountData drafts and local queue"
              icon="account-cash-outline"
              onPress={() =>
                router.push(
                  "/(tabs)/admin/storage/account-data-submission-queue",
                )
              }
            />
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Access Restricted</Text>
            <Text style={styles.emptySubtitle}>
              You do not have permission to view local storage tools.
            </Text>
          </View>
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
  contentContainer: {
    padding: 12,
    paddingBottom: 40,
  },

  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
    marginLeft: 8,
  },
  heroSubtitle: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 18,
  },

  cardsWrap: {},
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardLeft: {
    marginRight: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 17,
  },

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 18,
  },
});
