import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Link } from "expo-router";
import { useFlashcard } from "../src/context/FlashcardContext";
import { isRetiredCard } from "../src/domain/scheduler";
import { deleteAssocProjectsByDeckId } from "../src/domain/assocProjectStorage";
import type { Deck } from "../src/domain/models";

function DeckPicker({
  decks,
  selectedDeckId,
  onSelect,
}: {
  decks: Deck[];
  selectedDeckId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.deckRow}>
      {decks.map((deck) => {
        const active = selectedDeckId === deck.id;
        return (
          <Pressable
            key={deck.id}
            style={[styles.deckChip, active && styles.deckChipActive]}
            onPress={() => onSelect(deck.id)}
          >
            <Text style={[styles.deckChipText, active && styles.deckChipTextActive]}>{deck.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function HomeScreen() {
  const vm = useFlashcard();
  const [newDeckName, setNewDeckName] = useState("");
  const [search, setSearch] = useState("");

  const visibleDecks = useMemo(
    () =>
      vm.state.decks.filter((d) =>
        search.trim() ? `${d.name} ${d.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase()) : true
      ),
    [vm.state.decks, search]
  );

  if (!vm.ready) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>正在加载数据...</Text>
      </View>
    );
  }

  const onCreateDeck = () => {
    if (!newDeckName.trim()) return;
    vm.createDeck(newDeckName);
    setNewDeckName("");
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Flashcard Mobile</Text>
        <Text style={styles.subtitle}>
          卡组 {vm.state.decks.length} 个 / 卡片 {vm.state.cards.length} 张 / 总复习 {vm.state.stats.totalReviews} 次
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>卡组</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="搜索卡组..."
            placeholderTextColor="#64748b"
            style={styles.input}
          />
          <DeckPicker decks={visibleDecks} selectedDeckId={vm.selectedDeckId} onSelect={vm.selectDeck} />
          <View style={styles.inlineRow}>
            <TextInput
              value={newDeckName}
              onChangeText={setNewDeckName}
              placeholder="新卡组名称"
              placeholderTextColor="#64748b"
              style={styles.input}
            />
            <Pressable onPress={onCreateDeck} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>新建</Text>
            </Pressable>
          </View>
        </View>

        {visibleDecks.map((deck) => {
          const cards = vm.state.cards.filter((c) => c.deckId === deck.id);
          const due = cards.filter((c) => !isRetiredCard(c) && c.lastReviewAt !== null && c.nextReview !== null && c.nextReview <= vm.getNow()).length;
          const newCount = cards.filter((c) => c.lastReviewAt === null).length;
          return (
            <View key={deck.id} style={styles.section}>
              <Text style={styles.deckName}>{deck.name}</Text>
              <Text style={styles.subtitle}>
                共 {cards.length} 张 · 新卡 {newCount} · 待复习 {due}
              </Text>
              <View style={styles.inlineRow}>
                <Link href={`/study/${deck.id}` as never} asChild>
                  <Pressable style={styles.primaryBtn}>
                    <Text style={styles.primaryBtnText}>开始复习</Text>
                  </Pressable>
                </Link>
                <Link href={`/deck/${deck.id}/cards` as never} asChild>
                  <Pressable style={styles.rateBtn}>
                    <Text style={styles.rateText}>管理卡片</Text>
                  </Pressable>
                </Link>
                <Pressable
                  style={[styles.rateBtn, { backgroundColor: "#7f1d1d" }]}
                  onPress={() => {
                    Alert.alert("删除卡组", `确定删除「${deck.name}」？`, [
                      { text: "取消", style: "cancel" },
                      {
                        text: "删除",
                        style: "destructive",
                        onPress: async () => {
                          await deleteAssocProjectsByDeckId(deck.id);
                          vm.deleteDeck(deck.id);
                        },
                      },
                    ]);
                  }}
                >
                  <Text style={styles.rateText}>删除</Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        <View style={styles.inlineRow}>
          <Link href="/stats" asChild>
            <Pressable style={styles.rateBtn}>
              <Text style={styles.rateText}>统计</Text>
            </Pressable>
          </Link>
          <Link href="/settings" asChild>
            <Pressable style={styles.rateBtn}>
              <Text style={styles.rateText}>设置</Text>
            </Pressable>
          </Link>
          <Link href="/lab" asChild>
            <Pressable style={styles.rateBtn}>
              <Text style={styles.rateText}>实验室</Text>
            </Pressable>
          </Link>
          <Link href="/assoc" asChild>
            <Pressable style={styles.rateBtn}>
              <Text style={styles.rateText}>联想</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#020617" },
  title: { color: "#e2e8f0", fontSize: 24, fontWeight: "700" },
  subtitle: { color: "#94a3b8", marginTop: 4 },
  section: { backgroundColor: "#0f172a", borderRadius: 12, padding: 12, gap: 10 },
  sectionTitle: { color: "#e2e8f0", fontSize: 16, fontWeight: "700" },
  deckName: { color: "#e2e8f0", fontSize: 18, fontWeight: "700" },
  deckRow: { gap: 8, paddingVertical: 2 },
  deckChip: { borderColor: "#334155", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  deckChipActive: { borderColor: "#38bdf8", backgroundColor: "#0c4a6e" },
  deckChipText: { color: "#cbd5e1" },
  deckChipTextActive: { color: "#e0f2fe" },
  inlineRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    color: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "#020617",
  },
  primaryBtn: { backgroundColor: "#0369a1", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, alignSelf: "flex-start" },
  primaryBtnText: { color: "#e0f2fe", fontWeight: "700" },
  rateRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rateBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "#1e293b" },
  rateText: { color: "#e2e8f0", textTransform: "capitalize", fontWeight: "600" },
});
