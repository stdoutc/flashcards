import AsyncStorage from "@react-native-async-storage/async-storage";

export type AssocTreeState = {
  rootId: string | null;
  focusId: string | null;
  children: Record<string, string[]>;
};

export type AssocProject = {
  id: string;
  name: string;
  deckId: string;
  createdAt: number;
  updatedAt: number;
  graph: AssocTreeState;
};

const STORAGE_KEY = "flashcard-assoc-projects-v1";

function nowTs(): number {
  return Date.now();
}
function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
function normalizeGraph(graph?: Partial<AssocTreeState> | null): AssocTreeState {
  return { rootId: graph?.rootId ?? null, focusId: graph?.focusId ?? null, children: graph?.children ?? {} };
}

async function readAll(): Promise<AssocProject[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as AssocProject[];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((p) => ({
        id: String(p.id ?? ""),
        name: String(p.name ?? "未命名联想图谱"),
        deckId: String(p.deckId ?? ""),
        createdAt: Number(p.createdAt ?? nowTs()),
        updatedAt: Number(p.updatedAt ?? nowTs()),
        graph: normalizeGraph(p.graph),
      }))
      .filter((p) => p.id);
  } catch {
    return [];
  }
}

async function writeAll(projects: AssocProject[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // ignore
  }
}

function nextUnnamedProjectName(existing: AssocProject[]): string {
  const base = "未命名联想图谱";
  const names = new Set(existing.map((p) => p.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

export async function listAssocProjects(): Promise<AssocProject[]> {
  return (await readAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function getAssocProject(id: string): Promise<AssocProject | null> {
  return (await readAll()).find((p) => p.id === id) ?? null;
}
export async function createAssocProject(name: string, deckId: string): Promise<AssocProject> {
  const ts = nowTs();
  const all = await readAll();
  const trimmed = name.trim();
  const finalName = trimmed || nextUnnamedProjectName(all);
  const project: AssocProject = {
    id: uid(),
    name: finalName,
    deckId,
    createdAt: ts,
    updatedAt: ts,
    graph: { rootId: null, focusId: null, children: {} },
  };
  all.unshift(project);
  await writeAll(all);
  return project;
}
export async function updateAssocProjectMeta(
  id: string,
  patch: Partial<Pick<AssocProject, "name" | "deckId">>
): Promise<AssocProject | null> {
  const all = await readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    ...patch,
    name: patch.name !== undefined ? patch.name.trim() || all[idx].name : all[idx].name,
    updatedAt: nowTs(),
  };
  await writeAll(all);
  return all[idx];
}
export async function saveAssocProjectGraph(id: string, graph: AssocTreeState): Promise<AssocProject | null> {
  const all = await readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], updatedAt: nowTs(), graph: normalizeGraph(graph) };
  await writeAll(all);
  return all[idx];
}
export async function deleteAssocProject(id: string): Promise<void> {
  await writeAll((await readAll()).filter((p) => p.id !== id));
}
export async function deleteAssocProjectsByDeckId(deckId: string): Promise<void> {
  await writeAll((await readAll()).filter((p) => p.deckId !== deckId));
}
