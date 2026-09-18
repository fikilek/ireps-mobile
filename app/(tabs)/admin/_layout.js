// /app/(tabs)/admin/_layout.js
import { Stack } from "expo-router";

export default function AdminLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: "Admin", headerShown: true }}
      />
      {/* TB-R051 (1.3.38): one title bar in Operations; each Operations screen shows its own. */}
      <Stack.Screen
        name="operations"
        options={{ title: "Operations", headerShown: false }}
      />
      <Stack.Screen
        name="pendingUsers"
        options={{ title: "Pending Users", headerShown: true }}
      />
      <Stack.Screen
        name="reports"
        options={{ title: "Reports", headerShown: false }}
      />
      <Stack.Screen
        name="service-providers"
        options={{ title: "Service Providers", headerShown: true }}
      />
      <Stack.Screen
        name="settings"
        options={{ title: "Settings", headerShown: true }}
      />
      <Stack.Screen
        name="storage"
        options={{ title: "Storage", headerShown: false }}
      />
      <Stack.Screen
        name="user"
        options={{ title: "User", headerShown: true }}
      />
      <Stack.Screen
        name="users"
        options={{ title: "Users", headerShown: true }}
      />
    </Stack>
  );
}
