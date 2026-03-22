/** 联想模式：从图谱页传入的树结构（v2） */
export type AssocRecallPayloadV2 = {
  v: 2;
  deckId: string;
  rootId: string;
  children: Record<string, string[]>;
};
