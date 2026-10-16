// tools.js —— 领域操作：M0 规则 Agent 与 M1 LLM function-calling 共用
import { open, uid, nowISO, get, getAll, put, del, clear } from "./db.js";

/* ---------- 任务 ---------- */
export async function listTasks({ includeDone = true } = {}) {
  await open();
  const all = await getAll("tasks");
  const rows = all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return includeDone ? rows : rows.filter(t => !t.done);
}
export async function addTask({ title, note = "", due = null }) {
  await open();
  const t = { id: uid(), title, note, due, done: false, createdAt: nowISO(), updatedAt: nowISO() };
  await put("tasks", t);
  return t;
}
export async function findTasks(q) {
  await open();
  const kw = q.trim().toLowerCase();
  if (!kw) return [];
  return (await getAll("tasks"))
    .filter(t => t.title.toLowerCase().includes(kw) || (t.note || "").toLowerCase().includes(kw))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function toggleTask(id) {
  await open();
  const t = await get("tasks", id);
  if (!t) return null;
  t.done = !t.done; t.updatedAt = nowISO();
  await put("tasks", t);
  return t;
}
export async function updateTask(id, patch) {
  await open();
  const t = await get("tasks", id);
  if (!t) return null;
  Object.assign(t, patch, { updatedAt: nowISO() });
  await put("tasks", t);
  return t;
}
export async function deleteTask(id) {
  await open();
  return del("tasks", id);
}
export async function countPending() {
  await open();
  return (await getAll("tasks")).filter(t => !t.done).length;
}

/* ---------- 记录 ---------- */
export async function addEntry(text, tags = []) {
  await open();
  const e = { id: uid(), type: "note", text, tags, createdAt: nowISO() };
  await put("entries", e);
  return e;
}
export async function searchEntries(q) {
  await open();
  const kw = q.trim().toLowerCase();
  if (!kw) return [];
  return (await getAll("entries"))
    .filter(e => e.text.toLowerCase().includes(kw) || e.tags.some(t => t.toLowerCase().includes(kw)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function listEntries(limit = 50) {
  await open();
  return (await getAll("entries"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
export async function deleteEntry(id) { await open(); return del("entries", id); }

/* ---------- 长期记忆 ---------- */
export async function addMemory(text, source = "manual") {
  await open();
  const m = { id: uid(), text, source, createdAt: nowISO() };
  await put("memories", m);
  return m;
}
export async function listMemories(limit = 100) {
  await open();
  return (await getAll("memories")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}
export async function deleteMemory(id) { await open(); return del("memories", id); }

/* ---------- 会话与消息 ---------- */
export async function listSessions() {
  await open();
  return (await getAll("sessions")).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function createSession(title = "新对话") {
  await open();
  const s = { id: uid(), title, createdAt: nowISO(), updatedAt: nowISO() };
  await put("sessions", s);
  return s;
}
export async function updateSession(id, patch) {
  await open();
  const s = await get("sessions", id);
  if (!s) return null;
  Object.assign(s, patch, { updatedAt: nowISO() });
  await put("sessions", s);
  return s;
}
export async function deleteSession(id) {
  await open();
  const msgs = (await getAll("messages")).filter(m => m.sessionId === id);
  for (const m of msgs) await del("messages", m.id);
  return del("sessions", id);
}
export async function addMessage(sessionId, role, content) {
  await open();
  const m = { id: uid(), sessionId, role, content, at: nowISO() };
  await put("messages", m);
  return m;
}
export async function listMessages(sessionId) {
  await open();
  return (await getAll("messages"))
    .filter(m => m.sessionId === sessionId)
    .sort((a, b) => a.at.localeCompare(b.at));
}

/* ---------- 导出 / 导入 ---------- */
export async function exportAll() {
  await open();
  return {
    app: "muse-pwa", version: 1, exportedAt: nowISO(),
    tasks: await getAll("tasks"),
    entries: await getAll("entries"),
    memories: await getAll("memories"),
    sessions: await getAll("sessions"),
    messages: await getAll("messages")
  };
}
export async function importAll(data, { replace = true } = {}) {
  if (!data || data.app !== "muse-pwa") throw new Error("不是本应用的备份文件");
  await open();
  if (replace) {
    for (const s of ["tasks", "entries", "memories", "sessions", "messages"]) await clear(s);
  }
  for (const store of ["tasks", "entries", "memories", "sessions", "messages"]) {
    for (const row of data[store] || []) await put(store, row);
  }
}
export async function wipeAll() {
  await open();
  for (const s of ["tasks", "entries", "memories", "sessions", "messages", "kv"]) await clear(s);
}
