import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity } from "react-native";

const ADMIN_HOME_ROUTE = "/(tabs)/admin";

// TB-R051 (1.3.38): the Admin area has no title bar over Operations any more, so the
// Operations menu carries its own back arrow to Admin.
// router.canGoBack() is not enough here: the tabs can always go back, which would leave
// the Admin tab. Go back only when an Admin screen sits under Operations.
function adminScreenIsBelowOperations(navigation) {
  const adminStackState = navigation?.getParent?.()?.getState?.();

  return Number(adminStackState?.index) > 0;
}

function OperationsBackToAdminButton({ navigation, tintColor }) {
  const router = useRouter();

  function handleBackPress() {
    if (adminScreenIsBelowOperations(navigation)) {
      router.back();
      return;
    }

    router.replace(ADMIN_HOME_ROUTE);
  }

  return (
    <TouchableOpacity
      style={styles.backToAdminButton}
      activeOpacity={0.8}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Back to Admin"
      onPress={handleBackPress}
    >
      <MaterialCommunityIcons
        name="chevron-left"
        size={26}
        color={tintColor || "#0f172a"}
      />
    </TouchableOpacity>
  );
}

export default function OperationsLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={({ navigation }) => ({
          title: "Operations",
          headerBackVisible: false,
          headerLeft: ({ tintColor }) => (
            <OperationsBackToAdminButton
              navigation={navigation}
              tintColor={tintColor}
            />
          ),
        })}
      />

      <Stack.Screen
        name="teams"
        options={{
          title: "Operational Teams",
        }}
      />

      <Stack.Screen
        name="revenue-analytics"
        options={{
          title: "Revenue Analytics",
        }}
      />

      <Stack.Screen
        name="geo-fences"
        options={{
          title: "",
        }}
      />

      <Stack.Screen
        name="my-workorders"
        options={{
          title: "My Workorders",
        }}
      />

      <Stack.Screen
        name="targeted-batch-no-access"
        options={{ title: "Targeted Batch No Access" }}
      />

      <Stack.Screen
        name="field-analytics"
        options={{
          title: "Field Analytics",
        }}
      />

      <Stack.Screen
        name="quality-assurance"
        options={{
          title: "Quality Assurance",
        }}
      />

      <Stack.Screen
        name="trn-origin"
        options={{
          title: "Lifecycle Instruction",
        }}
      />

      {/* TB-R051 (1.3.38): the WMS Dashboard screens had no title of their own and showed
          their file path (for example "dashboard/control") in the title bar. */}
      <Stack.Screen
        name="dashboard/index"
        options={{ title: "WMS Dashboard" }}
      />

      <Stack.Screen
        name="dashboard/control"
        options={{ title: "Manager Control" }}
      />

      <Stack.Screen
        name="dashboard/user-activity"
        options={{ title: "User Activity" }}
      />

      <Stack.Screen
        name="dashboard/team-activity"
        options={{ title: "Team Activity" }}
      />

      <Stack.Screen
        name="dashboard/sp-activity"
        options={{ title: "SP Activity" }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  backToAdminButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 12,
    marginLeft: -6,
  },
});
