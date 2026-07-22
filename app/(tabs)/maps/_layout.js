// app/(tabs)/maps/_layout.js
import { Stack } from "expo-router";

export default function MapsLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="formInformalErf"
        options={{
          headerShown: true,
          title: "Informal Erf Form",
        }}
      />
    </Stack>
  );
}
