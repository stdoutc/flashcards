import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFlashcard } from "../../src/context/FlashcardContext";
import { getAssocProject } from "../../src/domain/assocProjectStorage";
import { findPathFromRoot, preorderSubtree } from "../../src/domain/assocTree";
import { clearAssocRecallReviewed, loadAssocRecallReviewed, saveAssocRecallReviewed } from "../../src/domain/assocRecallReviewStorage";

export default function AssocRecallPage() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { state } = useFlashcard();
  const [project, setProject] = useState<Awaited<ReturnType<typeof getAssocProject>>>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!projectId) return;
    getAssocProject(projectId).then((p) => {
      setProject(p);
      setCurrentId(p?.graph.rootId ?? null);
    });
  }, [projectId]);

  useEffect(() => {
    if (!project?.graph.rootId) return;
    const valid = new Set(preorderSubtree(project.graph.rootId, project.graph.children));
    loadAssocRecallReviewed(project.deckId, project.graph.rootId, project.graph.children, valid).then(setReviewed);
  }, [project?.id, project?.graph.rootId]);

  const cards = useMemo(() => state.cards.filter((c) => c.deckId === project?.deckId), [state.cards, project?.deckId]);
  const currentCard = cards.find((c) => c.id === currentId) ?? null;
  const childIds = currentId ? project?.graph.children[currentId] ?? [] : [];

  if (!project || !project.graph.rootId) {
    return <View style={styles.root}><Text style={styles.title}>联想回忆</Text><Text style={styles.sub}>请选择有效项目并设置根节点</Text></View>;
  }

  const markReviewedAndSave = async (id: string) => {
    const next = new Set(reviewed);
    next.add(id);
    setReviewed(next);
    await saveAssocRecallReviewed(project.deckId, project.graph.rootId!, project.graph.children, next);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={styles.title}>联想回忆</Text>
      {currentCard ? (
        <View style={styles.card}>
          <Text style={styles.label}>正面</Text>
          <Text style={styles.text}>{currentCard.front}</Text>
          {showBack && (
            <>
              <Text style={styles.label}>反面</Text>
              <Text style={styles.text}>{currentCard.back}</Text>
            </>
          )}
          {!showBack ? (
            <Pressable style={styles.btn} onPress={() => setShowBack(true)}>
              <Text style={styles.btnText}>显示答案</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.btn}
              onPress={async () => {
                await markReviewedAndSave(currentCard.id);
                setShowBack(false);
              }}
            >
              <Text style={styles.btnText}>标记已复习</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Text style={styles.sub}>当前节点无卡片</Text>
      )}

      <View style={styles.card}>
        <Text style={styles.sub}>可选下一节点（{childIds.length}）</Text>
        {childIds.map((id) => {
          const c = cards.find((x) => x.id === id);
          return (
            <Pressable key={id} style={styles.item} onPress={() => { setCurrentId(id); setShowBack(false); }}>
              <Text style={styles.itemText}>{c?.front ?? id}{reviewed.has(id) ? "  ✓" : ""}</Text>
            </Pressable>
          );
        })}
        {childIds.length === 0 && <Text style={styles.sub}>已到叶子节点</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.sub}>路径导航</Text>
        {(currentId ? findPathFromRoot(project.graph.rootId, currentId, project.graph.children) : [project.graph.rootId])?.map((id) => {
          const c = cards.find((x) => x.id === id);
          return (
            <Pressable key={id} style={styles.item} onPress={() => setCurrentId(id)}>
              <Text style={styles.itemText}>{c?.front ?? id}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={[styles.btn, { backgroundColor: "#7f1d1d" }]}
        onPress={async () => {
          await clearAssocRecallReviewed(project.deckId);
          setReviewed(new Set());
        }}
      >
        <Text style={styles.btnText}>清空复习进度</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  title: { color: "#e2e8f0", fontSize: 20, fontWeight: "700" },
  sub: { color: "#94a3b8" },
  card: { backgroundColor: "#0f172a", borderRadius: 12, padding: 12, gap: 8 },
  label: { color: "#38bdf8" },
  text: { color: "#e2e8f0", fontSize: 16 },
  btn: { backgroundColor: "#0369a1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, alignSelf: "flex-start" },
  btnText: { color: "#e2e8f0", fontWeight: "600" },
  item: { backgroundColor: "#1e293b", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  itemText: { color: "#e2e8f0" },
});
