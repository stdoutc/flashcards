import { Link, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFlashcard } from "../../src/context/FlashcardContext";
import { getDailyProgress, getTodayStart, previewNextIntervals } from "../../src/domain/scheduler";
import type { ReviewRating } from "../../src/domain/models";

export default function StudyPage() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const vm = useFlashcard();
  const [revealed, setRevealed] = useState(false);
  const [practiceN, setPracticeN] = useState("10");

  useEffect(() => {
    if (deckId) vm.selectDeck(deckId);
  }, [deckId]);

  useEffect(() => {
    setRevealed(false);
  }, [vm.currentStudyCard?.id]);

  const deck = useMemo(() => vm.state.decks.find((d) => d.id === deckId) ?? null, [vm.state.decks, deckId]);
  const todayStats = useMemo(() => {
    const now = vm.getNow();
    const todayStart = getTodayStart(now);
    const cards = vm.state.cards.filter((c) => c.deckId === deckId);
    const learning = cards.filter((c) => c.lastReviewAt !== null && c.lastReviewAt >= todayStart && (c.nextReview ?? 0) <= now).length;
    const review = cards.filter((c) => c.lastReviewAt !== null && c.lastReviewAt < todayStart && (c.nextReview ?? 0) <= now).length;
    const { newToday } = getDailyProgress(vm.state.reviewLogs, deckId ?? "", now);
    const newPool = cards.filter((c) => c.lastReviewAt === null).length;
    const extra = vm.practiceSession?.target ?? 0;
    const newLimit = (deck?.newPerDay ?? 0) + extra;
    return { learning, review, newPool, newToday, newRemaining: Math.min(newPool, Math.max(0, newLimit - newToday)) };
  }, [vm.state.cards, vm.state.reviewLogs, vm.getNow, deckId, vm.practiceSession, deck]);
  const preview = useMemo(() => (vm.currentStudyCard ? previewNextIntervals(vm.currentStudyCard) : null), [vm.currentStudyCard]);

  if (!vm.ready) return <View style={styles.center}><Text style={styles.text}>加载中...</Text></View>;
  if (!deckId || !deck) return <View style={styles.center}><Text style={styles.text}>未找到卡组</Text></View>;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{deck.name}</Text>
      <Text style={styles.sub}>今日新卡 {vm.dailyProgress?.newToday ?? 0}/{vm.dailyProgress?.newLimit ?? 0}</Text>
      <Text style={styles.sub}>学习中 {todayStats.learning} · 待复习 {todayStats.review} · 新卡 {todayStats.newRemaining}</Text>

      {vm.currentStudyCard ? (
        <View style={styles.card}>
          <Text style={styles.label}>正面</Text>
          <Text style={styles.text}>{vm.currentStudyCard.front}</Text>
          {revealed && (
            <>
              <Text style={styles.label}>反面</Text>
              <Text style={styles.text}>{vm.currentStudyCard.back}</Text>
            </>
          )}
          {!revealed ? (
            <Pressable style={styles.btn} onPress={() => setRevealed(true)}><Text style={styles.btnText}>显示答案</Text></Pressable>
          ) : (
            <View style={styles.row}>
              {(["again", "hard", "good", "easy"] as ReviewRating[]).map((rating) => (
                <Pressable key={rating} style={styles.chip} onPress={() => vm.reviewCurrentCard(rating)}>
                  <Text style={styles.btnText}>{rating}</Text>
                  {preview && <Text style={styles.tip}>{preview[rating]}</Text>}
                </Pressable>
              ))}
              <Pressable style={[styles.chip, { backgroundColor: "#14532d" }]} onPress={vm.markCurrentCardMastered}>
                <Text style={styles.btnText}>掌握</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.text}>本轮已完成</Text>
          <View style={styles.row}>
            <TextInput
              value={practiceN}
              onChangeText={setPracticeN}
              keyboardType="number-pad"
              style={styles.input}
            />
            <Pressable
              style={styles.btn}
              onPress={() => {
                const n = parseInt(practiceN, 10);
                if (Number.isFinite(n) && n > 0) vm.startPracticeCards(n);
              }}
            >
              <Text style={styles.btnText}>再学 N 张</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.row}>
        <Link href="/" asChild><Pressable style={styles.chip}><Text style={styles.btnText}>返回首页</Text></Pressable></Link>
        <Link href={`/deck/${deckId}/cards` as never} asChild><Pressable style={styles.chip}><Text style={styles.btnText}>管理卡片</Text></Pressable></Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#020617" },
  title: { color: "#e2e8f0", fontSize: 22, fontWeight: "700" },
  sub: { color: "#94a3b8" },
  card: { backgroundColor: "#0f172a", borderRadius: 12, padding: 12, gap: 10 },
  label: { color: "#38bdf8" },
  text: { color: "#e2e8f0", fontSize: 16 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  btn: { backgroundColor: "#0369a1", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  btnText: { color: "#e2e8f0", fontWeight: "600" },
  chip: { backgroundColor: "#1e293b", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  tip: { color: "#94a3b8", fontSize: 11 },
  input: { minWidth: 80, borderWidth: 1, borderColor: "#334155", borderRadius: 8, color: "#e2e8f0", paddingHorizontal: 10, paddingVertical: 8 },
});
