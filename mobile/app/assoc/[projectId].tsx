import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFlashcard } from "../../src/context/FlashcardContext";
import { getAssocProject, saveAssocProjectGraph, type AssocProject } from "../../src/domain/assocProjectStorage";

export default function AssocProjectPage() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { state } = useFlashcard();
  const [project, setProject] = useState<AssocProject | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string>("");

  const refresh = async () => {
    if (!projectId) return;
    setProject(await getAssocProject(projectId));
  };
  useEffect(() => {
    refresh();
  }, [projectId]);

  const deckCards = useMemo(
    () => state.cards.filter((c) => c.deckId === project?.deckId),
    [state.cards, project?.deckId]
  );
  const focusChildren = project?.graph.focusId ? project.graph.children[project.graph.focusId] ?? [] : [];

  if (!project) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>联想图谱编辑</Text>
        <Text style={styles.sub}>项目不存在或加载中</Text>
      </View>
    );
  }

  const setRoot = async (cardId: string) => {
    await saveAssocProjectGraph(project.id, { rootId: cardId, focusId: cardId, children: { [cardId]: [] } });
    await refresh();
  };
  const setFocus = async (cardId: string) => {
    await saveAssocProjectGraph(project.id, { ...project.graph, focusId: cardId });
    await refresh();
  };
  const addChild = async () => {
    if (!selectedCardId || !project.graph.focusId) return;
    const pid = project.graph.focusId;
    const next = { ...project.graph.children };
    const list = [...(next[pid] ?? [])];
    if (!list.includes(selectedCardId)) list.push(selectedCardId);
    next[pid] = list;
    if (!next[selectedCardId]) next[selectedCardId] = [];
    await saveAssocProjectGraph(project.id, { ...project.graph, children: next });
    setSelectedCardId("");
    await refresh();
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={styles.title}>联想图谱编辑</Text>
      <Text style={styles.sub}>项目 ID: {projectId}</Text>
      <Text style={styles.sub}>名称：{project.name}</Text>
      <Text style={styles.sub}>根节点：{project.graph.rootId ?? "未设置"} · 焦点：{project.graph.focusId ?? "未设置"}</Text>

      {!project.graph.rootId && (
        <View style={styles.card}>
          <Text style={styles.sub}>选择根节点（从卡组卡片中选择）</Text>
          {deckCards.slice(0, 30).map((c) => (
            <Pressable key={c.id} style={styles.item} onPress={() => setRoot(c.id)}>
              <Text style={styles.itemText}>{c.front}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {project.graph.rootId && (
        <>
          <View style={styles.card}>
            <Text style={styles.sub}>切换焦点节点</Text>
            {[project.graph.rootId, ...Object.keys(project.graph.children)].filter(Boolean).map((id) => {
              const card = deckCards.find((c) => c.id === id);
              return (
                <Pressable key={id} style={[styles.item, project.graph.focusId === id && styles.active]} onPress={() => setFocus(id)}>
                  <Text style={styles.itemText}>{card?.front ?? id}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.card}>
            <Text style={styles.sub}>当前焦点的子节点（{focusChildren.length}）</Text>
            {focusChildren.map((id) => {
              const card = deckCards.find((c) => c.id === id);
              return <Text key={id} style={styles.sub}>- {card?.front ?? id}</Text>;
            })}
            <Text style={[styles.sub, { marginTop: 8 }]}>添加子节点</Text>
            {deckCards.slice(0, 40).map((c) => (
              <Pressable key={c.id} style={[styles.item, selectedCardId === c.id && styles.active]} onPress={() => setSelectedCardId(c.id)}>
                <Text style={styles.itemText}>{c.front}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.btn} onPress={addChild}>
              <Text style={styles.btnText}>添加为子节点</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  title: { color: "#e2e8f0", fontSize: 20, fontWeight: "700" },
  sub: { color: "#94a3b8" },
  card: { backgroundColor: "#0f172a", borderRadius: 12, padding: 12, gap: 8 },
  item: { backgroundColor: "#1e293b", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  active: { backgroundColor: "#0c4a6e" },
  itemText: { color: "#e2e8f0" },
  btn: { backgroundColor: "#0369a1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, marginTop: 4 },
  btnText: { color: "#e2e8f0" },
});
