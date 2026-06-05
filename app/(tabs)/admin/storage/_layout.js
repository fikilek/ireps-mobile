import { Stack } from "expo-router";

export default function StorageLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitleAlign: "center",
        headerShadowVisible: false,
        animation: "none",
        headerStyle: {
          backgroundColor: "#FFFFFF",
        },
        headerTintColor: "#0F172A",
        headerTitleStyle: {
          fontSize: 15,
          fontWeight: "900",
          color: "#0F172A",
        },
        contentStyle: {
          backgroundColor: "#F8FAFC",
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Storage",
        }}
      />

      <Stack.Screen
        name="forms-submission-queue"
        options={{
          title: "Meter Discovery Queue",
        }}
      />

      <Stack.Screen
        name="account-data-submission-queue"
        options={{
          title: "Account Data Queue",
        }}
      />

      <Stack.Screen
        name="ward-erfs-sync"
        options={{
          title: "Ward ERF Sync",
        }}
      />

      <Stack.Screen
        name="sales-sync"
        options={{
          title: "Sales Sync",
        }}
      />
      <Stack.Screen
        name="premise-offline-storage"
        options={{
          title: "Premise Offline Storage",
        }}
      />
    </Stack>
  );
}
