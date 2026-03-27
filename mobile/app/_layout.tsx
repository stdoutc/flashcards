import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FlashcardProvider } from "../src/context/FlashcardContext";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <FlashcardProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "#0b1220" },
            headerTintColor: "#e2e8f0",
            contentStyle: { backgroundColor: "#020617" },
          }}
        />
      </FlashcardProvider>
    </SafeAreaProvider>
  );
}
