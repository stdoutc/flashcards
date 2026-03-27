import { Link } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFlashcard } from "../src/context/FlashcardContext";

function dayKey(ts: number): string {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export default function StatsPage() {
  const { state } = useFlashcard();
  const kpi = useMemo(() => {
    const totalCards = state.cards.length;
    const mastered = state.cards.filter((c) => c.mastery >= 4).length;
    const today = dayKey(Date.now());
    const todayLogs = state.reviewLogs.filter((l) => dayKey(l.reviewedAt) === today).length;
    return { totalCards, mastered, todayLogs };
  }, [state]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>数据统计</Text>
      <View style={styles.grid}>
        <View style={styles.kpi}><Text style={styles.k}>{state.decks.length}</Text><Text style={styles.l}>卡组</Text></View>
        <View style={styles.kpi}><Text style={styles.k}>{kpi.totalCards}</Text><Text style={styles.l}>卡片</Text></View>
        <View style={styles.kpi}><Text style={styles.k}>{state.stats.totalReviews}</Text><Text style={styles.l}>累计学习</Text></View>
        <View style={styles.kpi}><Text style={styles.k}>{kpi.mastered}</Text><Text style={styles.l}>已掌握</Text></View>
        <View style={styles.kpi}><Text style={styles.k}>{kpi.todayLogs}</Text><Text style={styles.l}>今日学习</Text></View>
      </View>
      {state.decks.map((d) => {
        const cards = state.cards.filter((c) => c.deckId === d.id);
        const mastered = cards.filter((c) => c.mastery >= 4).length;
        return (
          <View key={d.id} style={styles.deck}>
            <Text style={styles.deckName}>{d.name}</Text>
            <Text style={styles.l}>共 {cards.length} 张 · 已掌握 {mastered} 张</Text>
            <View style={styles.row}>
              <Link href={`/study/${d.id}` as never} asChild><Pressable style={styles.btn}><Text style={styles.bt}>学习</Text></Pressable></Link>
              <Link href={`/deck/${d.id}/cards` as never} asChild><Pressable style={styles.btn}><Text style={styles.bt}>管理</Text></Pressable></Link>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  content: { padding: 16, gap: 12 },
  title: { color: "#e2e8f0", fontSize: 22, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpi: { width: "48%", backgroundColor: "#0f172a", borderRadius: 12, padding: 10 },
  k: { color: "#e2e8f0", fontSize: 20, fontWeight: "700" },
  l: { color: "#94a3b8" },
  deck: { backgroundColor: "#0f172a", borderRadius: 12, padding: 12, gap: 8 },
  deckName: { color: "#e2e8f0", fontSize: 16, fontWeight: "700" },
  row: { flexDirection: "row", gap: 8 },
  btn: { backgroundColor: "#1e293b", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  bt: { color: "#e2e8f0" },
});
