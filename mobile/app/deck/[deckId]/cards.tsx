import { Link, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFlashcard } from "../../../src/context/FlashcardContext";
import type { Card } from "../../../src/domain/models";

export default function CardEditPage() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const vm = useFlashcard();
  const [search, setSearch] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [tags, setTags] = useState("");
  const [editing, setEditing] = useState<Card | null>(null);

  useEffect(() => {
    if (deckId) vm.selectDeck(deckId);
  }, [deckId]);

  const deck = useMemo(() => vm.state.decks.find((d) => d.id === deckId) ?? null, [vm.state.decks, deckId]);
  const cards = useMemo(() => vm.state.cards.filter((c) => c.deckId === deckId), [vm.state.cards, deckId]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q)));
  }, [cards, search]);

  if (!vm.ready) return <View style={styles.center}><Text style={styles.text}>加载中...</Text></View>;
  if (!deckId || !deck) return <View style={styles.center}><Text style={styles.text}>未找到卡组</Text></View>;

  const resetEditor = () => {
    setEditing(null);
    setFront("");
    setBack("");
    setTags("");
  };

  const saveCard = () => {
    if (!front.trim() || !back.trim()) return;
    const tagsArr = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (editing) {
      vm.updateCard(editing.id, { front: front.trim(), back: back.trim(), tags: tagsArr });
    } else {
      vm.createCard(deckId, {
        deckId,
        cardType: "basic",
        front: front.trim(),
        back: back.trim(),
        tags: tagsArr,
        mastery: 0,
        easeFactor: 2.5,
        interval: 24 * 60 * 60 * 1000,
        nextReview: null,
        lastReviewAt: null,
      });
    }
    resetEditor();
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>管理卡片 · {deck.name}</Text>
      <View style={styles.row}>
        <Link href={`/study/${deckId}` as never} asChild><Pressable style={styles.chip}><Text style={styles.btnText}>开始复习</Text></Pressable></Link>
        <Link href="/" asChild><Pressable style={styles.chip}><Text style={styles.btnText}>返回首页</Text></Pressable></Link>
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>{editing ? "编辑卡片" : "新建卡片"}</Text>
        <TextInput style={styles.input} value={front} onChangeText={setFront} placeholder="正面" placeholderTextColor="#64748b" />
        <TextInput style={[styles.input, { minHeight: 90 }]} value={back} onChangeText={setBack} placeholder="反面" placeholderTextColor="#64748b" multiline />
        <TextInput style={styles.input} value={tags} onChangeText={setTags} placeholder="标签（逗号分隔）" placeholderTextColor="#64748b" />
        <View style={styles.row}>
          <Pressable style={styles.btn} onPress={saveCard}><Text style={styles.btnText}>{editing ? "保存修改" : "添加卡片"}</Text></Pressable>
          {editing && <Pressable style={styles.chip} onPress={resetEditor}><Text style={styles.btnText}>取消</Text></Pressable>}
        </View>
      </View>

      <View style={styles.block}>
        <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder="搜索内容或标签..." placeholderTextColor="#64748b" />
        <Text style={styles.sub}>共 {cards.length} 张，匹配 {filtered.length} 张</Text>
        {filtered.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={styles.front}>{c.front}</Text>
            <Text style={styles.text}>{c.back}</Text>
            {c.tags.length > 0 && <Text style={styles.sub}>#{c.tags.join(" #")}</Text>}
            <View style={styles.row}>
              <Pressable style={styles.chip} onPress={() => {
                setEditing(c);
                setFront(c.front);
                setBack(c.back);
                setTags(c.tags.join(", "));
              }}><Text style={styles.btnText}>编辑</Text></Pressable>
              <Pressable style={[styles.chip, { backgroundColor: "#7f1d1d" }]} onPress={() => {
                Alert.alert("删除卡片", "确定删除该卡片？", [
                  { text: "取消", style: "cancel" },
                  { text: "删除", style: "destructive", onPress: () => vm.deleteCard(c.id) },
                ]);
              }}><Text style={styles.btnText}>删除</Text></Pressable>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#020617" },
  title: { color: "#e2e8f0", fontSize: 20, fontWeight: "700" },
  block: { backgroundColor: "#0f172a", borderRadius: 12, padding: 12, gap: 10 },
  label: { color: "#e2e8f0", fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#334155", borderRadius: 8, color: "#e2e8f0", paddingHorizontal: 10, paddingVertical: 9, backgroundColor: "#020617" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  btn: { backgroundColor: "#0369a1", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8 },
  chip: { backgroundColor: "#1e293b", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: "#e2e8f0", fontWeight: "600" },
  sub: { color: "#94a3b8" },
  card: { backgroundColor: "#020617", borderWidth: 1, borderColor: "#1e293b", borderRadius: 10, padding: 10, gap: 6 },
  front: { color: "#e2e8f0", fontSize: 16, fontWeight: "700" },
  text: { color: "#cbd5e1" },
});
