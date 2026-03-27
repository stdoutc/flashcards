import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFlashcard } from "../../src/context/FlashcardContext";
import { createAssocProject, deleteAssocProject, listAssocProjects, type AssocProject } from "../../src/domain/assocProjectStorage";

export default function AssocHomePage() {
  const { state } = useFlashcard();
  const [projects, setProjects] = useState<AssocProject[]>([]);
  const [name, setName] = useState("");
  const [deckId, setDeckId] = useState("");

  const refresh = async () => setProjects(await listAssocProjects());
  useEffect(() => {
    refresh();
    if (!deckId && state.decks[0]?.id) setDeckId(state.decks[0].id);
  }, [state.decks.length]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={styles.title}>联想图谱</Text>
      <Text style={styles.sub}>项目管理 / 编辑 / 回忆流程</Text>

      <View style={styles.card}>
        <Text style={styles.sub}>新建图谱</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="图谱名称（可空）" placeholderTextColor="#64748b" />
        <Text style={styles.sub}>选择卡组（默认第一个）</Text>
        {state.decks.map((d) => (
          <Pressable key={d.id} style={[styles.deckBtn, deckId === d.id && styles.deckBtnActive]} onPress={() => setDeckId(d.id)}>
            <Text style={styles.deckText}>{d.name}</Text>
          </Pressable>
        ))}
        <Pressable
          style={styles.btn}
          onPress={async () => {
            if (!deckId) return;
            await createAssocProject(name, deckId);
            setName("");
            await refresh();
          }}
        >
          <Text style={styles.bt}>创建图谱</Text>
        </Pressable>
      </View>

      {projects.map((p) => (
        <View key={p.id} style={styles.card}>
          <Text style={styles.projectName}>{p.name}</Text>
          <Text style={styles.sub}>卡组：{state.decks.find((d) => d.id === p.deckId)?.name ?? "未知"}</Text>
          <View style={styles.row}>
            <Link href={`/assoc/${p.id}` as never} asChild><Pressable style={styles.btn}><Text style={styles.bt}>编辑</Text></Pressable></Link>
            <Link href={`/assoc/recall?projectId=${p.id}` as never} asChild><Pressable style={styles.deckBtn}><Text style={styles.deckText}>回忆</Text></Pressable></Link>
            <Pressable
              style={[styles.deckBtn, { backgroundColor: "#7f1d1d" }]}
              onPress={() =>
                Alert.alert("删除图谱", `确定删除「${p.name}」？`, [
                  { text: "取消", style: "cancel" },
                  {
                    text: "删除",
                    style: "destructive",
                    onPress: async () => {
                      await deleteAssocProject(p.id);
                      await refresh();
                    },
                  },
                ])
              }
            >
              <Text style={styles.deckText}>删除</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  title: { color: "#e2e8f0", fontSize: 20, fontWeight: "700" },
  sub: { color: "#94a3b8", lineHeight: 20 },
  card: { backgroundColor: "#0f172a", borderRadius: 12, padding: 12, gap: 8 },
  input: { borderWidth: 1, borderColor: "#334155", borderRadius: 8, color: "#e2e8f0", paddingHorizontal: 10, paddingVertical: 9, backgroundColor: "#020617" },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  btn: { backgroundColor: "#0369a1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  bt: { color: "#e2e8f0" },
  deckBtn: { backgroundColor: "#1e293b", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  deckBtnActive: { backgroundColor: "#0c4a6e" },
  deckText: { color: "#e2e8f0" },
  projectName: { color: "#e2e8f0", fontWeight: "700", fontSize: 16 },
});
