import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { doc, updateDoc } from "firebase/firestore";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { ActivityIndicator, List, Text, Title } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../../src/firebase";
import { authApi, useSetActiveWorkbaseMutation } from "../../src/redux/authApi";

export default function SelectWorkbase() {
  const router = useRouter();
  const { data: authState } = authApi.endpoints.getAuthState.useQueryState();
  const [setActiveWorkbase, { isLoading }] = useSetActiveWorkbaseMutation();

  const uid = authState?.auth?.uid;
  const workbases = authState?.profile?.access?.workbases || [];

  const updaterName =
    authState?.profile?.profile?.displayName ||
    authState?.profile?.identity?.displayName ||
    authState?.profile?.profile?.email ||
    authState?.profile?.identity?.email ||
    auth.currentUser?.email ||
    "System";

  const handleSelect = async (workbase) => {
    try {
      if (!uid) return;

      // 1. Update active workbase via existing mutation
      await setActiveWorkbase({
        uid,
        workbase: {
          id: workbase.id,
          name: workbase.name,
        },
      }).unwrap();

      // 2. Mark onboarding complete
      // AU-R001 5: only changing the password clears the demand. Choosing a workbase must never
      // clear it, or a demanded change could be tapped past.
      await updateDoc(doc(db, "users", uid), {
        "onboarding.status": "COMPLETED",
        "metadata.updatedAt": new Date().toISOString(),
        "metadata.updatedByUid": uid,
        "metadata.updatedByUser": updaterName,
      });

      // 3. Move into app
      router.replace("/(tabs)/erfs");
    } catch (error) {
      console.log("select-workbase error", error);
    }
  };

  if (!authState) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading workbases...</Text>
      </View>
    );
  }

  if (!workbases.length) {
    return (
      <View style={styles.centered}>
        <Title style={styles.title}>No Workbases Found</Title>
        <Text style={styles.subtitle}>
          Your account does not yet have any inherited workbases.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.replace("/signin")}
        >
          <Text style={styles.primaryButtonText}>Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <Title style={styles.title}>Select Your Workbase</Title>
        <Text style={styles.subtitle}>
          Your manager has assigned you to the following areas. Choose the
          workbase you want to use as your active operational scope.
        </Text>

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 20 }} />
        ) : (
          <FlashList
            data={workbases}
            keyExtractor={(item) => item.id}
            estimatedItemSize={72}
            renderItem={({ item }) => (
              <List.Item
                title={item.name}
                description={item.id ? `LM: ${item.id}` : undefined}
                left={(props) => (
                  <List.Icon {...props} icon="city-variant-outline" />
                )}
                onPress={() => handleSelect(item)}
                style={styles.listItem}
              />
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#fff",
  },
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
  },
  centered: {
    flex: 1,
    padding: 24,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    marginBottom: 20,
    color: "gray",
    textAlign: "center",
    lineHeight: 20,
  },
  loadingText: {
    marginTop: 10,
    color: "gray",
  },
  listItem: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  primaryButton: {
    marginTop: 20,
    minHeight: 48,
    minWidth: 180,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
