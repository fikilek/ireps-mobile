import { Stack } from "expo-router";

export default function OperationsLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Operations",
        }}
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
    </Stack>
  );
}
