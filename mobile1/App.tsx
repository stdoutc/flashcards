import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import type { WebViewMessageEvent } from "react-native-webview";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { applyNotificationSettingsFromWeb, applyReviewDueOnceFromWeb } from "./dailyReminder";

/** 与 `src/styles.css` 中 `:root --bg` 一致，避免安全区/WebView 与页面色差 */
const APP_BG = "#050816";

function handleWebViewMessage(event: WebViewMessageEvent): void {
  try {
    const data = JSON.parse(event.nativeEvent.data) as { type?: string } & Record<string, unknown>;
    if (data.type === "notificationSettings") {
      const daily = data.daily as { enabled?: boolean; hour?: number; minute?: number } | undefined;
      void applyNotificationSettingsFromWeb({
        daily: {
          enabled: daily?.enabled === true,
          hour: typeof daily?.hour === "number" ? daily.hour : 9,
          minute: typeof daily?.minute === "number" ? daily.minute : 0,
        },
      });
    }
    if (data.type === "reviewDueOnce") {
      void applyReviewDueOnceFromWeb();
    }
  } catch {
    // ignore
  }
}

export default function App() {
  const [htmlSource, setHtmlSource] = useState<{ html: string; baseUrl: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadLocalHtml = async () => {
      try {
        const indexAsset = Asset.fromModule(require("./assets/web/index.html"));
        await indexAsset.downloadAsync();
        const resolved = indexAsset.localUri ?? indexAsset.uri ?? null;

        if (!cancelled) {
          if (resolved) {
            const html = await FileSystem.readAsStringAsync(resolved);
            const baseUrl = resolved.replace(/[^/]+$/, "");
            setHtmlSource({ html, baseUrl });
          } else {
            setLoadError("未能解析本地网页入口文件。");
          }
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setLoadError(`加载离线网页失败: ${message}`);
        }
      }
    };

    void loadLocalHtml();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadingNode = useMemo(
    () => (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.hint}>正在加载离线学习应用...</Text>
      </View>
    ),
    [],
  );

  if (loadError) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.center}>
            <Text style={styles.errorTitle}>加载失败</Text>
            <Text style={styles.errorBody}>{loadError}</Text>
          </View>
          <StatusBar style="light" />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (!htmlSource) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea}>
          {loadingNode}
          <StatusBar style="light" />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <WebView
          source={htmlSource}
          originWhitelist={["*"]}
          allowFileAccess
          allowUniversalAccessFromFileURLs
          allowingReadAccessToURL={htmlSource.baseUrl}
          style={[styles.webView, { backgroundColor: APP_BG }]}
          containerStyle={{ backgroundColor: APP_BG }}
          setBuiltInZoomControls={false}
          setDisplayZoomControls={false}
          bounces={false}
          overScrollMode={Platform.OS === "android" ? "never" : undefined}
          contentInsetAdjustmentBehavior="never"
          startInLoadingState
          renderLoading={() => loadingNode}
          onError={(event) => {
            setLoadError(`WebView 加载失败: ${event.nativeEvent.description}`);
          }}
          onMessage={handleWebViewMessage}
          injectedJavaScriptBeforeContentLoaded={
            "try{window.__FLASHCARD_MOBILE_SHELL__=true;}catch(e){}true;"
          }
        />
        <StatusBar style="light" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: APP_BG,
  },
  webView: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
    backgroundColor: APP_BG,
  },
  hint: {
    fontSize: 15,
    color: "#94a3b8",
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#C62828",
  },
  errorBody: {
    marginTop: 8,
    fontSize: 14,
    color: "#cbd5e1",
    textAlign: "center",
  },
});
