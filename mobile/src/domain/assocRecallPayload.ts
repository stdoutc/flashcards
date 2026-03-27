export type AssocRecallPayloadV2 = {
  v: 2;
  deckId: string;
  rootId: string;
  children: Record<string, string[]>;
};
