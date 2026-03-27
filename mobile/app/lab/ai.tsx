import { useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useFlashcard } from "../../src/context/FlashcardContext";

type PromptMode = "fast" | "accurate";
type DraftCard = { id: string; front: string; back: string };

const FAST_PROMPT = `你是一位专业教育助手。请根据图片生成可学习闪卡。若是题目，front 保留题干，back 给答案和简明解析；若是知识点，转换成问答式。仅输出 JSON 数组：[{"front":"...","back":"..."}]`;
const ACCURATE_PROMPT = `你是一位专业教育助手。先判断图片是题目类或知识点类，再生成高质量闪卡。题目类：front 保留题干和选项，back 给正确答案、解析、易错点。知识点类：front 用提问句，back 给结构化答案。仅输出 JSON 数组：[{"front":"...","back":"..."}]`;

async function callDoubaoVision(apiKey: string, model: string, imageDataUrl: string, prompt: string): Promise<DraftCard[]> {
  const resp = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: imageDataUrl } }, { type: "text", text: prompt }] }],
    }),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.statusText);
    throw new Error(`API 请求失败（${resp.status}）：${err}`);
  }
  const data = await resp.json();
  const raw = String(data.choices?.[0]?.message?.content ?? "");
  const clean = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  const arr = start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
  const parsed = JSON.parse(arr) as Array<{ front: string; back: string }>;
  return parsed
    .filter((x) => x && typeof x.front === "string" && typeof x.back === "string")
    .map((x) => ({ id: Math.random().toString(36).slice(2, 10), front: x.front.trim(), back: x.back.trim() }));
}

export default function LabAiPage() {
  const { state, createCard } = useFlashcard();
  const [mode, setMode] = useState<PromptMode>("fast");
  const [loading, setLoading] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [draftCards, setDraftCards] = useState<DraftCard[]>([]);
  const [deckId, setDeckId] = useState("");
  const canRun = !!imageDataUrl && !loading;

  const model = useMemo(() => state.settings.doubaoModel?.trim() || "doubao-1-5-vision-pro-32k-250115", [state.settings.doubaoModel]);

  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      base64: true,
    });
    if (r.canceled || !r.assets[0]) return;
    const asset = r.assets[0];
    if (!asset.base64) {
      Alert.alert("失败", "读取图片失败，请重试");
      return;
    }
    const mime = asset.mimeType || "image/jpeg";
    setImageDataUrl(`data:${mime};base64,${asset.base64}`);
  };

  const runAI = async () => {
    if (!imageDataUrl) return;
    if (!state.settings.doubaoApiKey?.trim()) {
      Alert.alert("缺少配置", "请先在设置页填写豆包 API Key");
      return;
    }
    setLoading(true);
    try {
      const cards = await callDoubaoVision(state.settings.doubaoApiKey.trim(), model, imageDataUrl, mode === "fast" ? FAST_PROMPT : ACCURATE_PROMPT);
      if (!cards.length) throw new Error("未识别到有效卡片");
      setDraftCards(cards);
      if (!deckId && state.decks[0]?.id) setDeckId(state.decks[0].id);
    } catch (e) {
      Alert.alert("识别失败", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const importCards = () => {
    if (!deckId) {
      Alert.alert("提示", "请选择目标卡组");
      return;
    }
    const valid = draftCards.filter((c) => c.front && c.back);
    valid.forEach((c) =>
      createCard(deckId, {
        deckId,
        cardType: "basic",
        front: c.front,
        back: c.back,
        tags: [],
        mastery: 0,
        easeFactor: 2.5,
        interval: 24 * 60 * 60 * 1000,
        nextReview: null,
        lastReviewAt: null,
      })
    );
    Alert.alert("完成", `已导入 ${valid.length} 张卡片`);
    setDraftCards([]);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={styles.title}>AI 智能识别制卡</Text>
      <Text style={styles.sub}>上传图片 → AI 识别 → 审核 → 导入卡组</Text>

      <View style={styles.card}>
        <Pressable style={styles.btn} onPress={pickImage}><Text style={styles.bt}>{imageDataUrl ? "更换图片" : "选择图片"}</Text></Pressable>
        {imageDataUrl && <Image source={{ uri: imageDataUrl }} style={styles.preview} resizeMode="contain" />}
        <View style={styles.row}>
          <Pressable style={[styles.chip, mode === "fast" && styles.active]} onPress={() => setMode("fast")}><Text style={styles.bt}>快速模式</Text></Pressable>
          <Pressable style={[styles.chip, mode === "accurate" && styles.active]} onPress={() => setMode("accurate")}><Text style={styles.bt}>精确模式</Text></Pressable>
        </View>
        <Pressable style={[styles.btn, !canRun && { opacity: 0.6 }]} disabled={!canRun} onPress={runAI}><Text style={styles.bt}>{loading ? "识别中..." : "运行识别"}</Text></Pressable>
      </View>

      {!!draftCards.length && (
        <View style={styles.card}>
          <Text style={styles.sub}>识别结果（{draftCards.length}）</Text>
          {state.decks.map((d) => (
            <Pressable key={d.id} style={[styles.chip, deckId === d.id && styles.active]} onPress={() => setDeckId(d.id)}>
              <Text style={styles.bt}>{d.name}</Text>
            </Pressable>
          ))}
          {draftCards.map((c, i) => (
            <View key={c.id} style={styles.draft}>
              <Text style={styles.sub}>#{i + 1}</Text>
              <TextInput style={styles.input} value={c.front} onChangeText={(v) => setDraftCards((p) => p.map((x) => (x.id === c.id ? { ...x, front: v } : x)))} />
              <TextInput style={[styles.input, { minHeight: 72 }]} multiline value={c.back} onChangeText={(v) => setDraftCards((p) => p.map((x) => (x.id === c.id ? { ...x, back: v } : x)))} />
            </View>
          ))}
          <Pressable style={styles.btn} onPress={importCards}><Text style={styles.bt}>导入卡组</Text></Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  title: { color: "#e2e8f0", fontSize: 20, fontWeight: "700" },
  sub: { color: "#94a3b8", lineHeight: 22 },
  card: { backgroundColor: "#0f172a", borderRadius: 12, padding: 12, gap: 8 },
  btn: { backgroundColor: "#0369a1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, alignSelf: "flex-start" },
  bt: { color: "#e2e8f0" },
  preview: { width: "100%", height: 180, borderRadius: 10, backgroundColor: "#020617" },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { backgroundColor: "#1e293b", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  active: { backgroundColor: "#0c4a6e" },
  draft: { backgroundColor: "#020617", borderRadius: 10, borderWidth: 1, borderColor: "#1e293b", padding: 8, gap: 6 },
  input: { borderWidth: 1, borderColor: "#334155", borderRadius: 8, color: "#e2e8f0", paddingHorizontal: 8, paddingVertical: 8, backgroundColor: "#020617" },
});
