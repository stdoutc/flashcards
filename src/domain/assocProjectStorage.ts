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

const STORAGE_KEY = 'flashcard-assoc-projects-v1';

function nowTs(): number {
  return Date.now();
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeGraph(graph?: Partial<AssocTreeState> | null): AssocTreeState {
  return {
    rootId: graph?.rootId ?? null,
    focusId: graph?.focusId ?? null,
    children: graph?.children ?? {},
  };
}

function readAll(): AssocProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as AssocProject[];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((p) => ({
        id: String(p.id ?? ''),
        name: String(p.name ?? '未命名联想图谱'),
        deckId: String(p.deckId ?? ''),
        createdAt: Number(p.createdAt ?? nowTs()),
        updatedAt: Number(p.updatedAt ?? nowTs()),
        graph: normalizeGraph(p.graph),
      }))
      .filter((p) => p.id);
  } catch {
    return [];
  }
}

function writeAll(projects: AssocProject[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // ignore
  }
}

function nextUnnamedProjectName(existing: AssocProject[]): string {
  const base = '未命名联想图谱';
  const names = new Set(existing.map((p) => p.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

export function listAssocProjects(): AssocProject[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getAssocProject(id: string): AssocProject | null {
  return readAll().find((p) => p.id === id) ?? null;
}

export function createAssocProject(name: string, deckId: string): AssocProject {
  const ts = nowTs();
  const all = readAll();
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
  writeAll(all);
  return project;
}

export function updateAssocProjectMeta(
  id: string,
  patch: Partial<Pick<AssocProject, 'name' | 'deckId'>>,
): AssocProject | null {
  const all = readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    ...patch,
    name: patch.name !== undefined ? patch.name.trim() || all[idx].name : all[idx].name,
    updatedAt: nowTs(),
  };
  writeAll(all);
  return all[idx];
}

export function saveAssocProjectGraph(id: string, graph: AssocTreeState): AssocProject | null {
  const all = readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    updatedAt: nowTs(),
    graph: normalizeGraph(graph),
  };
  writeAll(all);
  return all[idx];
}

export function deleteAssocProject(id: string): void {
  const all = readAll().filter((p) => p.id !== id);
  writeAll(all);
}

export function deleteAssocProjectsByDeckId(deckId: string): void {
  const all = readAll().filter((p) => p.deckId !== deckId);
  writeAll(all);
}

export function deleteAssocProjectsByDeckIds(deckIds: string[]): void {
  const idSet = new Set(deckIds);
  const all = readAll().filter((p) => !idSet.has(p.deckId));
  writeAll(all);
}

