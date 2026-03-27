import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function LabHomePage() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>实验室</Text>
      <Text style={styles.sub}>保持与网页版相同入口结构</Text>
      <Link href="/lab/ai" asChild>
        <Pressable style={styles.btn}><Text style={styles.bt}>AI 制卡</Text></Pressable>
      </Link>
      <Link href="/assoc" asChild>
        <Pressable style={styles.btn}><Text style={styles.bt}>联想图谱</Text></Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617", padding: 16, gap: 10 },
  title: { color: "#e2e8f0", fontSize: 22, fontWeight: "700" },
  sub: { color: "#94a3b8" },
  btn: { backgroundColor: "#1e293b", borderRadius: 10, padding: 12 },
  bt: { color: "#e2e8f0" },
});
