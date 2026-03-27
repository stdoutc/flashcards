import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

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
          <StatusBar style="auto" />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (!htmlSource) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea}>
          {loadingNode}
          <StatusBar style="auto" />
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
          startInLoadingState
          renderLoading={() => loadingNode}
          onError={(event) => {
            setLoadError(`WebView 加载失败: ${event.nativeEvent.description}`);
          }}
        />
        <StatusBar style="auto" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  hint: {
    fontSize: 15,
    color: "#666",
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#C62828",
  },
  errorBody: {
    marginTop: 8,
    fontSize: 14,
    color: "#333",
    textAlign: "center",
  },
});
