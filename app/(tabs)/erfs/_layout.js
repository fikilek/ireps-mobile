import { Stack } from "expo-router";

export default function ErfsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitleAlign: "center",
        headerShadowVisible: false,
        animation: "default",
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
          title: "ERFs",
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="ward-erfs-sync"
        options={{
          title: "Ward ERF Sync",
        }}
      />
    </Stack>
  );
}
