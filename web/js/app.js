// app.js —— UI 引导：渲染、会话、侧滑面板、旧数据迁移
import { open, kvGet, kvSet } from "./db.js?v=3";
import * as T from "./tools.js?v=3";
import { handle, hooks } from "./agent.js?v=3";

const $ = id => document.getElementById(id);
let state = { sessionId: null, sessions: [], busy: false };

/* ---------- 迁移旧清单数据 ---------- */
async function migrateLegacy() {
  if (await kvGet("migratedTodoV1")) return;
  try {
    const raw = localStorage.getItem("todoapp.tasks");
    if (raw) {
      const old = JSON.parse(raw) || [];
      let n = 0;
      for (const t of old) {
        await T.addTask({ title: t.title, note: t.note || "" });
        if (t.isDone) {
          const list = await T.listTasks();
          const mine = list.find(x => x.title === t.title && !x.done);
          if (mine) await T.toggleTask(mine.id);
        }
        n++;
      }
      if (n > 0) {
        await T.addMessage(state.sessionId, "assistant",
          `检测到旧版「清单」数据，已安全迁移 ${n} 条任务到新助手。旧页面归档在 /legacy/，随时可取。`);
      }
    }
  } catch { /* 忽略迁移失败，不影响主流程 */ }
  await kvSet("migratedTodoV1", true);
}

/* ---------- 会话 ---------- */
async function ensureSession() {
  state.sessions = await T.listSessions();
  state.sessionId = (await kvGet("activeSessionId")) || null;
  if (!state.sessionId || !state.sessions.some(s => s.id === state.sessionId)) {
    const s = state.sessions[0] || await T.createSession("日常");
    state.sessionId = s.id;
    await kvSet("activeSessionId", s.id);
  }
}
async function switchSession(id) {
  state.sessionId = id;
  await kvSet("activeSessionId", id);
  await renderChat();
  closeSheets();
}
async function newSession() {
  const s = await T.createSession("新对话");
  await switchSession(s.id);
}

/* ---------- 消息渲染 ---------- */
function bubble(m) {
  if (m.role === "user") return div("msg user", esc(m.content));
  return div("msg assistant", esc(m.content));
}
function div(cls, html) {
  const d = document.createElement("div");
  d.className = cls; d.innerHTML = html;
  return d;
}
function esc(s) {
  return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
async function renderChat() {
  const msgs = await T.listMessages(state.sessionId);
  const flow = $("flow");
  flow.innerHTML = "";
  if (!msgs.length) {
    flow.appendChild(div("hint",
      "👋 我是你的个人助手。试试：\n「添加任务：周五提交报告」 · 「记住：我对海鲜过敏」\n「简报」 · 「还有什么待办」 · 「现在几点」"));
  }
  for (const m of msgs) flow.appendChild(bubble(m));
  flow.scrollTop = flow.scrollHeight;
  const session = state.sessions.find(s => s.id === state.sessionId);
  $("sessionTitle").textContent = session ? session.title : "对话";
}

/* ---------- 发送 ---------- */
async function send() {
  if (state.busy) return;
  const input = $("input");
  const text = input.value.trim();
  if (!text) return;
  state.busy = true;
  input.value = "";
  await T.addMessage(state.sessionId, "user", text);
  await renderChat();
  const typing = div("msg assistant typing", "…");
  $("flow").appendChild(typing);
  $("flow").scrollTop = $("flow").scrollHeight;
  try {
    let reply;
    try {
      reply = await handle(text, { sessionId: state.sessionId }) || "……";
    } catch (e) {
      reply = "内部错误：" + (e && e.message ? e.message : e);
    }
    await T.addMessage(state.sessionId, "assistant", reply);
  } finally {
    typing.remove();
    await renderChat();
    state.busy = false;
  }
}

/* ---------- 侧滑面板 ---------- */
function openSheet(name) {
  closeSheets();
  $("sheet-" + name).classList.add("open");
  $("backdrop").classList.add("open");
  if (name === "tasks") renderTasks();
  if (name === "memories") renderMemories();
  if (name === "sessions") renderSessions();
}
function closeSheets() {
  document.querySelectorAll(".sheet").forEach(s => s.classList.remove("open"));
  $("backdrop").classList.remove("open");
}

async function renderTasks() {
  const rows = await T.listTasks();
  const box = $("taskList");
  box.innerHTML = "";
  $("taskCount").textContent = rows.filter(r => !r.done).length;
  rows.reverse().forEach(t => {
    const li = document.createElement("li");
    li.innerHTML = `<button class="circle ${t.done ? "done" : ""}">✓</button>
      <div class="tinfo"><div class="ttitle ${t.done ? "struck" : ""}">${esc(t.title)}</div>
      ${t.note ? `<div class="tnote">${esc(t.note)}</div>` : ""}</div>
      <button class="mini danger" data-del="${t.id}">✕</button>`;
    li.querySelector(".circle").onclick = async () => { await T.toggleTask(t.id); renderTasks(); };
    li.querySelector("[data-del]").onclick = async () => { await T.deleteTask(t.id); renderTasks(); };
    box.appendChild(li);
  });
}
async function renderMemories() {
  const rows = await T.listMemories();
  const box = $("memList");
  box.innerHTML = "";
  rows.forEach(m => {
    const li = document.createElement("li");
    li.innerHTML = `<div class="tinfo"><div class="ttitle">${esc(m.text)}</div>
      <div class="tnote">${m.createdAt.slice(0, 10)} · ${m.source === "auto" ? "自动提取" : "手动"}</div></div>
      <button class="mini danger" data-del="${m.id}">✕</button>`;
    li.querySelector("[data-del]").onclick = async () => { await T.deleteMemory(m.id); renderMemories(); };
    box.appendChild(li);
  });
  if (!rows.length) box.innerHTML = "<li class='emptyhint'>还没有记忆。聊天里说「记住：……」即可。</li>";
}
async function renderSessions() {
  const box = $("sessionList");
  box.innerHTML = "";
  for (const s of state.sessions) {
    const li = document.createElement("li");
    li.className = s.id === state.sessionId ? "current" : "";
    li.innerHTML = `<div class="tinfo"><div class="ttitle">${esc(s.title)}</div>
      <div class="tnote">${s.updatedAt.slice(0, 16).replace("T", " ")}</div></div>
      <button class="mini danger" data-del="${s.id}" title="删除">✕</button>`;
    li.querySelector(".tinfo").onclick = () => switchSession(s.id);
    li.querySelector("[data-del]").onclick = async (e) => {
      e.stopPropagation();
      if (state.sessions.length <= 1) return alert("至少保留一个会话");
      if (!confirm("删除该会话及其全部消息？")) return;
      await T.deleteSession(s.id);
      state.sessions = await T.listSessions();
      if (state.sessionId === s.id) {
        state.sessionId = state.sessions[0].id;
        await kvSet("activeSessionId", state.sessionId);
        await renderChat();
      }
      renderSessions();
    };
    box.appendChild(li);
  }
}

/* ---------- 设置面板 ---------- */
async function renderSettings() {
  $("modeBanner").textContent = "当前模式：离线规则引擎（AI 模型接入将在 M1 版本提供）";
}
async function doExport() {
  const data = await T.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "muse-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
}
async function doImport(file) {
  try {
    const data = JSON.parse(await file.text());
    await T.importAll(data);
    await ensureSession();
    await renderChat();
    alert("导入完成");
  } catch (e) { alert("导入失败：" + e.message); }
}

/* ---------- 绑定 ---------- */
function bind() {
  hooks.export = doExport;
  hooks.open = openSheet;
  $("sendBtn").onclick = send;
  $("input").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  $("btnTasks").onclick = () => openSheet("tasks");
  $("btnMemories").onclick = () => openSheet("memories");
  $("btnSessions").onclick = () => openSheet("sessions");
  $("btnSettings").onclick = () => { renderSettings(); openSheet("settings"); };
  $("backdrop").onclick = closeSheets;
  document.querySelectorAll("[data-close]").forEach(b => b.onclick = closeSheets);
  $("taskAddInput").addEventListener("keydown", async e => {
    if (e.key === "Enter" && e.target.value.trim()) {
      await T.addTask({ title: e.target.value.trim(), note: "" });
      e.target.value = ""; renderTasks();
    }
  });
  $("memAddInput").addEventListener("keydown", async e => {
    if (e.key === "Enter" && e.target.value.trim()) {
      await T.addMemory(e.target.value.trim(), "manual");
      e.target.value = ""; renderMemories();
    }
  });
  $("newSessionBtn").onclick = newSession;
  $("exportBtn").onclick = doExport;
  $("importFile").addEventListener("change", e => { if (e.target.files[0]) doImport(e.target.files[0]); });
  $("wipeBtn").onclick = async () => {
    if (!confirm("确定清空全部数据（任务/记忆/记录/会话）？此操作不可恢复！")) return;
    await T.wipeAll();
    // 清空后重建默认会话与标记
    localStorage.removeItem("todoapp.tasks");
    await kvSet("migratedTodoV1", true);
    state.sessionId = null;
    await ensureSession();
    await renderChat();
    closeSheets();
  };
}

/* ---------- 启动 ---------- */
(async function boot() {
  await open();
  await ensureSession();
  bind();
  await renderChat();
  await migrateLegacy();
  await renderChat();
})();
