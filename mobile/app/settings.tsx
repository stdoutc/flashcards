import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFlashcard } from "../src/context/FlashcardContext";

export default function SettingsPage() {
  const vm = useFlashcard();
  const [importText, setImportText] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>设置</Text>
      <View style={styles.card}>
        <Text style={styles.label}>每日新卡默认上限</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={String(vm.state.settings.defaultNewPerDay)}
          onChangeText={(v) => vm.updateSettings({ defaultNewPerDay: Math.max(1, Number(v) || 1) })}
        />
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>卡片列表显示方式</Text>
        <View style={styles.row}>
          <Pressable style={styles.btn} onPress={() => vm.updateSettings({ cardDisplayMode: "both" })}><Text style={styles.btnText}>正反都显示</Text></Pressable>
          <Pressable style={styles.btn} onPress={() => vm.updateSettings({ cardDisplayMode: "frontOnly" })}><Text style={styles.btnText}>仅正面</Text></Pressable>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>数据管理</Text>
        <View style={styles.row}>
          <Pressable style={styles.btn} onPress={() => setExportOpen((v) => !v)}><Text style={styles.btnText}>{exportOpen ? "隐藏导出" : "显示导出 JSON"}</Text></Pressable>
          <Pressable style={[styles.btn, { backgroundColor: "#7f1d1d" }]} onPress={() => {
            Alert.alert("清空数据", "确定清除全部数据？", [
              { text: "取消", style: "cancel" },
              { text: "清空", style: "destructive", onPress: vm.clearAllData },
            ]);
          }}><Text style={styles.btnText}>清空全部</Text></Pressable>
        </View>
        {exportOpen && <TextInput multiline style={[styles.input, { minHeight: 160 }]} value={vm.exportAllJson()} editable={false} />}
        <TextInput
          multiline
          style={[styles.input, { minHeight: 120 }]}
          placeholder="粘贴备份 JSON 并点击导入"
          placeholderTextColor="#64748b"
          value={importText}
          onChangeText={setImportText}
        />
        <Pressable style={styles.btn} onPress={() => {
          const ok = vm.importAllJson(importText);
          Alert.alert(ok ? "导入成功" : "导入失败", ok ? "数据已恢复" : "JSON 格式不正确");
          if (ok) setImportText("");
        }}><Text style={styles.btnText}>导入 JSON</Text></Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>AI 配置</Text>
        <TextInput style={styles.input} value={vm.state.settings.doubaoApiKey} onChangeText={(v) => vm.updateSettings({ doubaoApiKey: v })} placeholder="API Key" placeholderTextColor="#64748b" />
        <TextInput style={styles.input} value={vm.state.settings.doubaoModel} onChangeText={(v) => vm.updateSettings({ doubaoModel: v })} placeholder="Endpoint ID" placeholderTextColor="#64748b" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  content: { padding: 16, gap: 12 },
  title: { color: "#e2e8f0", fontSize: 22, fontWeight: "700" },
  card: { backgroundColor: "#0f172a", borderRadius: 12, padding: 12, gap: 8 },
  label: { color: "#e2e8f0", fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#334155", borderRadius: 8, color: "#e2e8f0", paddingHorizontal: 10, paddingVertical: 9, backgroundColor: "#020617" },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  btn: { backgroundColor: "#1e293b", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: "#e2e8f0" },
});
