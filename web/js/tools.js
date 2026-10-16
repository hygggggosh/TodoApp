// tools.js —— 领域操作 + function schema 定义（规则 Agent + LLM Agent 共用）
import { open, uid, nowISO, get, getAll, put, del, clear } from "./db.js?v=6";

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
  return { ...t, _undo: { fn: "deleteTask", args: { id: t.id } } };
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
  return { ...e, _undo: { fn: "deleteEntry", args: { id: e.id } } };
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
  return { ...m, _undo: { fn: "deleteMemory", args: { id: m.id } } };
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
export async function addMessage(sessionId, role, content, extra = {}) {
  await open();
  const m = { id: uid(), sessionId, role, content, at: nowISO(), ...extra };
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
    app: "muse-pwa", version: 2, exportedAt: nowISO(),
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

/* ---------- iOS 原生集成辅助 ---------- */
/* 生成 .ics 文件 data URL 供用户下载/导入系统日历 */
export function buildICS({ title, start, durationMin = 30, note = "" }) {
  const toICSDate = (iso) => {
    const d = new Date(iso);
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  };
  const startStr = toICSDate(start);
  const endStr = toICSDate(new Date(new Date(start).getTime() + durationMin * 60000).toISOString());
  const uidVal = uid() + "@muse-pwa";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Muse//PWA//ZH",
    "BEGIN:VEVENT",
    "UID:" + uidVal,
    "DTSTAMP:" + toICSDate(new Date().toISOString()),
    "DTSTART:" + startStr,
    "DTEND:" + endStr,
    "SUMMARY:" + String(title).replace(/\n/g, " "),
    note ? ("DESCRIPTION:" + String(note).replace(/\n/g, " ")) : "",
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter(Boolean);
  const text = lines.join("\r\n");
  const b64 = btoa(unescape(encodeURIComponent(text)));
  return { dataUrl: "data:text/calendar;base64," + b64, filename: title.replace(/[^\w\u4e00-\u9fa5-]+/g, "_") + ".ics", text };
}

/* 构造 iOS 原生地图深链：maps:// 协议被 iOS 拦截后直接拉起 Maps App */
export function buildMapsLink(query) {
  // iOS: maps:// 由系统拦截 → 拉起原生 Apple Maps App
  // 桌面/非 iOS 浏览器：maps:// 解析失败但失败是静默的，不影响其他操作
  return "maps://?q=" + encodeURIComponent(query) + "&near=Current+Location";
}

/* 把 .ics 文本包装为 File 对象（用于 Web Share API 分享到系统日历/提醒事项） */
export function createICSFile(text, filename) {
  return new File([text], filename, { type: "text/calendar" });
}

/* 撤销执行器 */
export async function runUndo(undo) {
  if (!undo || !undo.fn) return null;
  const fn = {
    deleteTask, deleteEntry, deleteMemory
  }[undo.fn];
  if (!fn) return null;
  return fn(undo.args.id);
}

/* ---------- OpenAI function-calling schema（供 LLM 工具调用） ---------- */
export const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "task_create",
      description: "新建一个任务/待办。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "任务标题，必填" },
          note: { type: "string", description: "可选备注" },
          due: { type: "string", description: "可选截止时间，ISO 字符串，例如 2026-10-20T15:00" }
        },
        required: ["title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "task_list",
      description: "列出任务，includeDone=true 同时返回已完成的任务。",
      parameters: {
        type: "object",
        properties: { includeDone: { type: "boolean" } }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "task_toggle",
      description: "切换任务完成/未完成状态，用任务标题里的关键词定位。",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "task_delete",
      description: "删除任务。",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "entry_add",
      description: "写一条生活记录/事实。",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "entry_search",
      description: "在记录中按关键词搜索。",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "memory_remember",
      description: "写入长期记忆：用户的偏好、重要事实（要主动长保的事实/偏好）。",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "memory_list",
      description: "列出所有长期记忆。",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "date_now",
      description: "获取当前本地时间和日期。",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "date_diff",
      description: "计算目标日期距离今天的天数。",
      parameters: {
        type: "object",
        properties: { date: { type: "string", description: "YYYY-MM-DD 或 ISO 字符串" } },
        required: ["date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "briefing_daily",
      description: "生成今日/近 7 天简报。",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "ics_generate",
      description: "为带时间的事件生成 .ics 日历文件，dataUrl 与文件名供下载。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          start: { type: "string", description: "ISO 时间" },
          durationMin: { type: "number" },
          note: { type: "string" }
        },
        required: ["title", "start"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "maps_open",
      description: "生成 Apple Maps 深链 URL，浏览器跳转后会自动拉起原生地图。",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "地址/地点" } },
        required: ["query"]
      }
    }
  }
];

/* ---------- 工具执行器（LLM 调用） ---------- */
export async function executeTool(name, args = {}, ctx = {}) {
  switch (name) {
    case "task_create": {
      const t = await addTask({ title: args.title, note: args.note || "", due: args.due || null });
      return { ok: true, action: "create_task", summary: "已创建任务：" + t.title, data: t };
    }
    case "task_list": {
      const rows = await listTasks({ includeDone: args.includeDone !== false });
      return { ok: true, action: "list_tasks", data: rows };
    }
    case "task_toggle": {
      const rows = await findTasks(args.query);
      if (!rows.length) return { ok: false, action: "toggle_task", error: "没找到匹配任务" };
      await toggleTask(rows[0].id);
      return { ok: true, action: "toggle_task", summary: "已切换「" + rows[0].title + "」状态", data: rows[0] };
    }
    case "task_delete": {
      const rows = await findTasks(args.query);
      if (!rows.length) return { ok: false, action: "delete_task", error: "没找到匹配任务" };
      await deleteTask(rows[0].id);
      return { ok: true, action: "delete_task", summary: "已删除任务：" + rows[0].title, data: rows[0] };
    }
    case "entry_add": {
      const e = await addEntry(args.text);
      return { ok: true, action: "create_entry", summary: "已记录：" + (args.text || "").slice(0, 30), data: e };
    }
    case "entry_search": {
      const rows = await searchEntries(args.query);
      return { ok: true, action: "search_entry", data: rows };
    }
    case "memory_remember": {
      const m = await addMemory(args.text, "llm");
      return { ok: true, action: "create_memory", summary: "已记住：" + args.text, data: m };
    }
    case "memory_list": {
      const rows = await listMemories();
      return { ok: true, action: "list_memories", data: rows };
    }
    case "date_now": {
      const d = new Date();
      return { ok: true, data: { iso: d.toISOString(), cn: d.toLocaleString("zh-CN") } };
    }
    case "date_diff": {
      const target = new Date(args.date);
      const today = new Date();
      const ms = target.setHours(0,0,0,0) - new Date(today.toDateString()).getTime();
      return { ok: true, data: { days: Math.round(ms / 86400000) } };
    }
    case "briefing_daily": {
      const pending = await listTasks({ includeDone: false });
      const entries = await listEntries(7);
      const todayKey = new Date().toISOString().slice(0, 10);
      const todayEntries = entries.filter(e => e.createdAt.slice(0,10) === todayKey);
      return {
        ok: true,
        data: {
          pending: pending.map(t => t.title),
          doneCount: (await listTasks()).filter(t => t.done).length,
          todayEntries: todayEntries.length
        }
      };
    }
    case "ics_generate": {
      const ics = buildICS({ title: args.title, start: args.start, durationMin: args.durationMin || 30, note: args.note || "" });
      return { ok: true, action: "ics", summary: "已生成日历邀请", data: ics };
    }
    case "maps_open": {
      return { ok: true, action: "maps", summary: "已生成地图链接", data: { url: buildMapsLink(args.query) } };
    }
    default:
      return { ok: false, error: "未知工具：" + name };
  }
}
