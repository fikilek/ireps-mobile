import { Stack } from "expo-router";
import { IconButton } from "react-native-paper";
import { useSignoutMutation } from "../../src/redux/authApi";

export default function OnboardingLayout() {
  const [signout, { isLoading }] = useSignoutMutation();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitleStyle: {
          fontWeight: "900",
          color: "#1e293b",
        },
        // 🎯 THE FIX: Manually provide an escape route
        headerLeft: () => (
          <IconButton
            icon="arrow-left"
            disabled={isLoading}
            onPress={() => signout()}
          />
        ),
      }}
    >
      <Stack.Screen
        name="complete-invited-profile"
        options={{ title: "COMPLETE SIGNUP" }}
      />

      <Stack.Screen
        name="awaiting-mng-confirmation"
        options={{ title: "PENDING APPROVAL" }}
      />

      <Stack.Screen
        name="select-workbase"
        options={{ title: "SELECT JURISDICTION" }}
      />

      <Stack.Screen name="waiting-sp" options={{ title: "AWAITING SP" }} />

      <Stack.Screen
        name="waiting-workbase"
        options={{ title: "AWAITING WORKBASE" }}
      />
    </Stack>
  );
}
