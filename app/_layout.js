import { Slot, useRouter, useSegments } from "expo-router";
import { memo, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Provider } from "react-redux";

import { PersistGate } from "redux-persist/integration/react";
import "../src/services/fwr-monitoring/fwrLocationTask";
import { DiscoveryProvider } from "../src/context/DiscoveryContext";
import { GeoProvider } from "../src/context/GeoContext";
import { InstallationProvider } from "../src/context/InstallationContext";
import { MapProvider } from "../src/context/MapContext";
import { WarehouseProvider } from "../src/context/WarehouseContext";
import { auth } from "../src/firebase";
import { useAuth } from "../src/hooks/useAuth";
import AuthBootstrap from "../src/navigation/AuthBootstrap";
import { persistor, store } from "../src/redux/store";
import FwrMonitoringCoordinator from "../src/services/fwr-monitoring/FwrMonitoringCoordinator";
import { startInformalErfQueueSyncService } from "../src/services/startInformalErfQueueSyncService";
import { startMeterDiscoveryNoAccessQueueSyncService } from "../src/services/startMeterDiscoveryNoAccessQueueSyncService";

const AuthGate = memo(function AuthGate() {
  const {
    user: reduxUser,
    profile,
    status,
    isLoading: reduxLoading,
    isADM,
    isMNG,
    isSPU,
    logoutInProgress,
  } = useAuth();

  const segments = useSegments();
  const router = useRouter();

  const user = logoutInProgress ? null : reduxUser || auth.currentUser;
  const isLoading = reduxLoading && !user;

  const [isLayoutReady, setIsLayoutReady] = useState(false);

  useEffect(() => {
    setIsLayoutReady(true);
  }, []);

  useEffect(() => {
    if (!isLayoutReady || isLoading) return;

    const rootSegment = segments[0];
    const isAtWelcome = segments.length === 0;
    const inAuthGroup = rootSegment === "(auth)";
    const inOnboardingGroup = rootSegment === "onboarding";

    const mustChangePassword = profile?.onboarding?.mustChangePassword === true;
    const activeWorkbase = profile?.access?.activeWorkbase || null;

    if (!user) {
      if (!inAuthGroup && !isAtWelcome) {
        router.replace("/signin");
      }
      return;
    }

    if (isAtWelcome) return;

    if (status === "PENDING" && mustChangePassword) {
      if (rootSegment !== "onboarding" || segments[1] !== "change-password") {
        router.replace("/onboarding/change-password");
      }
      return;
    }

    if (
      !mustChangePassword &&
      !activeWorkbase &&
      (status === "PENDING" ||
        status === "COMPLETED" ||
        status === "WORKBASE_REQUIRED")
    ) {
      if (rootSegment !== "onboarding" || segments[1] !== "select-workbase") {
        router.replace("/onboarding/select-workbase");
      }
      return;
    }

    switch (status) {
      case "AWAITING-MNG-CONFIRMATION":
      case "AWAITING-ADM-CONFIRMATION":
        if (isMNG || isADM) {
          if (
            rootSegment !== "onboarding" ||
            segments[1] !== "confirm-appointment"
          ) {
            router.replace("/onboarding/confirm-appointment");
          }
        } else {
          if (
            rootSegment !== "onboarding" ||
            segments[1] !== "awaiting-mng-confirmation"
          ) {
            router.replace("/onboarding/awaiting-mng-confirmation");
          }
        }
        return;

      case "COMPLETE":
      case "COMPLETED":
        if (inAuthGroup || inOnboardingGroup || isAtWelcome) {
          router.replace("/(tabs)/erfs");
        }
        return;

      default:
        return;
    }
  }, [
    user,
    profile,
    status,
    isLoading,
    segments,
    isLayoutReady,
    logoutInProgress,
  ]);

  const showOverlay =
    logoutInProgress || !isLayoutReady || isLoading || (user && !status);

  if (!showOverlay) return null;

  return (
    <View style={styles.loadingOverlay}>
      <ActivityIndicator size="large" color="#2563eb" />
      <Text style={styles.loadingText}>Synchronizing iREPS Registry...</Text>
      <Text style={styles.subLoadingText}>Verifying Garrison Credentials</Text>
    </View>
  );
});

const InformalErfQueueSyncCoordinator = memo(
  function InformalErfQueueSyncCoordinator() {
    const { user, profile, status, logoutInProgress } = useAuth();

    const agentUid = user?.uid || null;
    const agentName =
      profile?.profile?.displayName ||
      user?.displayName ||
      "iREPS User";

    useEffect(() => {
      if (
        logoutInProgress ||
        !agentUid ||
        !["COMPLETE", "COMPLETED"].includes(String(status || "").toUpperCase())
      ) {
        return undefined;
      }

      return startInformalErfQueueSyncService({
        agentUid,
        agentName,
      });
    }, [
      agentUid,
      agentName,
      logoutInProgress,
      status,
    ]);

    return null;
  },
);

const MeterDiscoveryNoAccessQueueSyncCoordinator = memo(
  function MeterDiscoveryNoAccessQueueSyncCoordinator() {
    const { user, profile, status, logoutInProgress } = useAuth();

    const agentUid = user?.uid || null;
    const agentName =
      profile?.profile?.displayName ||
      user?.displayName ||
      "iREPS User";

    useEffect(() => {
      if (
        logoutInProgress ||
        !agentUid ||
        !["COMPLETE", "COMPLETED"].includes(String(status || "").toUpperCase())
      ) {
        return undefined;
      }

      return startMeterDiscoveryNoAccessQueueSyncService({
        agentUid,
        agentName,
      });
    }, [
      agentUid,
      agentName,
      logoutInProgress,
      status,
    ]);

    return null;
  },
);

const SessionSlot = memo(function SessionSlot() {
  const { logoutInProgress } = useAuth();

  if (logoutInProgress) return null;

  return <Slot />;
});

export default function RootLayout() {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <GeoProvider>
          <WarehouseProvider>
            <MapProvider>
              <PaperProvider>
                <SafeAreaProvider>
                  <DiscoveryProvider>
                    <InstallationProvider>
                      <AuthBootstrap />
                      <FwrMonitoringCoordinator />
                      <InformalErfQueueSyncCoordinator />
                      <MeterDiscoveryNoAccessQueueSyncCoordinator />
                      <AuthGate />
                      <SessionSlot />
                    </InstallationProvider>
                  </DiscoveryProvider>
                </SafeAreaProvider>
              </PaperProvider>
            </MapProvider>
          </WarehouseProvider>
        </GeoProvider>
      </PersistGate>
    </Provider>
  );
}

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2000,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 14,
    color: "#1e293b",
    fontWeight: "600",
  },
  subLoadingText: {
    marginTop: 4,
    fontSize: 11,
    color: "#64748b",
  },
});
