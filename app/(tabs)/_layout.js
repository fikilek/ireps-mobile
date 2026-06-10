import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import AppHeader from "../../components/AppHeader";
import MissionDiscoveryModal from "../../components/MissionDiscoveryModal";

export default function TabsLayout() {
  const titles = {
    maps: "Maps",
    erfs: "ERFs",
    trns: "Trns",
    asts: "Meters",
    dashboard: "Dashboard",
    admin: "Admin",
    premises: "Premises",
    sales: "Sales",
  };

  return (
    <>
      <Tabs
        screenOptions={({ route }) => ({
          header: () => (
            <AppHeader title={titles[route.name]} />
          ),
          tabBarActiveTintColor: "#4CAF50",
          tabBarInactiveTintColor: "#888",
          tabBarStyle: {
            backgroundColor: "#d4d4d4",
            borderTopColor: "#d7d7d7",
          },
        })}
      >
        <Tabs.Screen name="index" options={{ href: null }} />

        <Tabs.Screen
          name="erfs"
          options={{
            title: "ERFs",
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons
                name="map-marker-radius-outline"
                color={color}
                size={size}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="premises"
          options={{
            title: "Premises",
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons
                name="office-building-marker-outline"
                color={color}
                size={size}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="trns"
          options={{
            title: "TRNs",
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons
                name="swap-horizontal"
                color={color}
                size={size}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="asts"
          options={{
            title: "ASTs",
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons
                name="counter"
                color={color}
                size={size}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="maps"
          options={{
            title: "Maps",
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons
                name="map-outline"
                color={color}
                size={size}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="admin"
          options={{
            title: "Admin",
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons
                name="shield-account-outline"
                color={color}
                size={size}
              />
            ),
          }}
        />
      </Tabs>

      {/* ✅ Mount it here (sibling of Tabs), NOT inside Tabs */}
      <MissionDiscoveryModal />
    </>
  );
}
