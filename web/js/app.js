// app.js —— UI 引导（v4: M1 真 Agent 集成）
import { open, kvGet, kvSet } from "./db.js?v=6";
import * as T from "./tools.js?v=6";
import { PROVIDERS, DEFAULT_SETTINGS, loadSettings, saveSettings, listModels } from "./providers.js?v=6";
import { handle, hooks } from "./agent.js?v=6";
import { getUsageStats } from "./usage.js?v=6";
import { maybeExtractMemories } from "./memoryExtractor.js?v=6";

const $ = id => document.getElementById(id);
let state = { sessionId: null, sessions: [], busy: false, currentAbort: null, lastActions: [] };

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
  } catch {}
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
function esc(s) {
  return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function msgNode(m) {
  const d = document.createElement("div");
  d.className = "msg " + m.role;
  d.innerText = m.content;
  return d;
}
function actionNode(action) {
  // 动作卡片：显示操作 + 撤销按钮（如果有 undo）
  const d = document.createElement("div");
  d.className = "action-card";
  const { tool, result } = action;
  const labelMap = {
    create_task: "✓ 新建任务",
    toggle_task: "✓ 切换完成",
    delete_task: "✗ 删除任务",
    create_entry: "✓ 新建记录",
    create_memory: "✓ 写入记忆",
    ics: "📅 日历邀请",
    maps: "📍 地图"
  };
  const label = labelMap[result.action] || ("✓ " + tool);
  d.innerHTML = `<div class="ac-row"><span>${label}</span><span class="ac-sum"></span></div>`;
  const sum = d.querySelector(".ac-sum");
  if (result.summary) sum.textContent = " " + result.summary;
  // ics / maps：提供"系统级"集成按钮
  if (result.action === "ics") {
    // iOS Safari 17+ / 桌面 Chrome 支持 navigator.share 文件
    // iOS 系统分享面板里直接出现"添加到日历/提醒事项/保存到文件"
    const btn = document.createElement("button");
    btn.className = "ac-undo";
    btn.textContent = "📲 添加到系统日历";
    btn.onclick = async () => {
      const file = T.createICSFile(result.data.text, result.data.filename);
      const nav = navigator;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: '添加到日历', text: result.data.filename.replace('.ics', '') });
          btn.textContent = "✓ 已触发系统分享";
        } catch (e) {
          if (e.name === "AbortError") return;
          btn.textContent = "分享失败：" + (e.message || e);
        }
      } else {
        // 不支持：降级到下载
        const a = document.createElement("a");
        a.href = result.data.dataUrl; a.download = result.data.filename; a.click();
        btn.textContent = "已下载 .ics（手动添加到日历）";
      }
    };
    d.appendChild(btn);
    // 附小字说明
    const hint = document.createElement("div");
    hint.className = "ac-hint";
    hint.textContent = "iPhone：弹出系统分享面板 → 选「日历/提醒事项」即可一键导入";
    d.appendChild(hint);
  }
  if (result.action === "maps") {
    // maps:// 是 iOS 通用协议，OS 会拦截后拉起原生 Apple Maps App
    const a = document.createElement("a");
    a.href = result.data.url;
    a.className = "ac-undo";
    a.style.textDecoration = "none";
    a.textContent = "📍 在 Apple Maps 中打开";
    d.appendChild(a);
    const hint = document.createElement("div");
    hint.className = "ac-hint";
    hint.textContent = "iPhone 会直接拉起原生地图 App";
    d.appendChild(hint);
  }
  // 撤销按钮
  if (result.data && result.data._undo) {
    const undo = result.data._undo;
    const btn = document.createElement("button");
    btn.className = "ac-undo";
    btn.textContent = "撤销";
    btn.onclick = async () => {
      btn.disabled = true;
      const ok = await T.runUndo(undo);
      btn.textContent = ok ? "已撤销" : "已不存在";
      setTimeout(() => d.remove(), 1200);
    };
    d.appendChild(btn);
  }
  return d;
}
async function renderChat() {
  const msgs = await T.listMessages(state.sessionId);
  const flow = $("flow");
  flow.innerHTML = "";
  if (!msgs.length) {
    const h = document.createElement("div");
    h.className = "hint";
    h.textContent = "👋 我是你的个人助手。试试：「添加任务：周五提交报告」 · 「记住：我对海鲜过敏」\n「简报」 · 「还有什么待办」 · 「现在几点」";
    flow.appendChild(h);
  }
  for (const m of msgs) {
    flow.appendChild(msgNode(m));
    if (m.actions && m.actions.length) {
      for (const a of m.actions) flow.appendChild(actionNode(a));
    }
  }
  flow.scrollTop = flow.scrollHeight;
  const session = state.sessions.find(s => s.id === state.sessionId);
  $("sessionTitle").textContent = session ? session.title : "对话";
}

/* ---------- 发送（含 LLM 流式）---------- */
async function send() {
  if (state.busy) return;
  const input = $("input");
  const text = input.value.trim();
  if (!text) return;
  state.busy = true;
  state.lastActions = [];
  input.value = "";

  // 存用户消息
  await T.addMessage(state.sessionId, "user", text);
  // 先把用户消息渲染出来
  await renderChat();

  // 创建一个 streaming 气泡
  const flow = $("flow");
  const streamBubble = document.createElement("div");
  streamBubble.className = "msg assistant streaming";
  streamBubble.textContent = "…";
  flow.appendChild(streamBubble);
  flow.scrollTop = flow.scrollHeight;
  // 创建一个动作容器
  const actionContainer = document.createElement("div");
  actionContainer.className = "action-list";
  flow.appendChild(actionContainer);
  flow.scrollTop = flow.scrollHeight;

  // 取消按钮：30s 超时
  const ac = new AbortController();
  state.currentAbort = ac;
  const timeout = setTimeout(() => ac.abort("timeout"), 60000);

  // 取历史消息（含刚加的 user）
  const history = await T.listMessages(state.sessionId);

  try {
    const r = await handle({
      text, sessionId: state.sessionId, history,
      onDelta: (full) => { streamBubble.textContent = full; flow.scrollTop = flow.scrollHeight; },
      onTool: (tc) => { /* 占位：可显示工具名小标签 */ },
      onAction: (a) => { actionContainer.appendChild(actionNode(a)); flow.scrollTop = flow.scrollHeight; }
    });
    clearTimeout(timeout);
    streamBubble.textContent = r.text || "（无回复）";
    streamBubble.classList.remove("streaming");
    // 收集 actions 到消息中以便后续重渲染
    await T.addMessage(state.sessionId, "assistant", r.text || "", { actions: state.lastActions });
  } catch (e) {
    const errText = "调用失败：" + (e.message || e);
    streamBubble.textContent = errText;
    streamBubble.classList.remove("streaming");
    streamBubble.classList.add("error");
    const retryBtn = document.createElement("button");
    retryBtn.className = "ac-undo";
    retryBtn.textContent = "↻ 重新发送";
    retryBtn.onclick = () => {
      $("input").value = text;
      retryBtn.disabled = true;
      send();
    };
    actionContainer.appendChild(retryBtn);
    await T.addMessage(state.sessionId, "assistant", errText);
  } finally {
    state.currentAbort = null;
    state.busy = false;
    await renderChat();
    // 后台异步长期记忆提取
    maybeExtractMemories(state.sessionId).catch(() => {});
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
  if (name === "settings") renderSettings();
}
function closeSheets() {
  document.querySelectorAll(".sheet").forEach(s => s.classList.remove("open"));
  $("backdrop").classList.remove("open");
}

async function renderTasks() {
  const rows = await T.listTasks();
  $("taskCount").textContent = rows.filter(r => !r.done).length;
  const box = $("taskList");
  box.innerHTML = "";
  rows.reverse().forEach(t => {
    const li = document.createElement("li");
    li.innerHTML = `<button class="circle ${t.done ? "done" : ""}">✓</button>
      <div class="tinfo"><div class="ttitle ${t.done ? "struck" : ""}">${esc(t.title)}</div>
      ${t.note ? `<div class="tnote">${esc(t.note)}</div>` : ""}
      ${t.due ? `<div class="tnote">⏰ ${esc(t.due.slice(0, 16).replace("T", " "))}</div>` : ""}
      </div>
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
      <div class="tnote">${m.createdAt.slice(0, 10)} · ${m.source === "auto" ? "🤖 自动提取" : (m.source === "llm" ? "✍️ Agent 写入" : "手动")}</div></div>
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
      <button class="mini danger" data-del="${s.id}">✕</button>`;
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

/* ---------- 设置面板（M1：模型接入中心 + 数据） ---------- */
async function renderSettings() {
  const s = await loadSettings();
  $("providerSel").value = s.provider;
  $("apiKey").value = s.apiKey;
  $("baseUrl").value = s.baseUrl;
  $("modelSel").innerHTML = `<option value="${esc(s.model)}">${esc(s.model)}</option>`;
  $("modelSel").value = s.model;
  $("reasoningSel").value = s.reasoningEffort;
  $("ctxBudget").value = s.ctxBudget;
  $("temperature").value = s.temperature;
  $("maxTokens").value = s.maxTokens;
  $("autoMemory").checked = s.autoMemory;
  // 模式 banner
  await renderModeBanner();
}

async function renderModeBanner() {
  const s = await loadSettings();
  const u = await getUsageStats();
  const today = u.todayPrompt + u.todayCompletion;
  const total = u.totalPrompt + u.totalCompletion;
  if (s.apiKey) {
    $("modeBanner").innerHTML = `🤖 <b>真 Agent 模式</b> · 模型 <b>${esc(s.model)}</b> · 今日 ${today.toLocaleString()} tokens · 累计 ${total.toLocaleString()} tokens`;
    $("modeBanner").className = "card mode-llm";
  } else {
    $("modeBanner").innerHTML = `📝 <b>离线规则模式</b> · 无 API Key · 在下方配置模型以启用真 Agent`;
    $("modeBanner").className = "card mode-rule";
  }
}

async function onProviderChange() {
  const id = $("providerSel").value;
  const p = PROVIDERS[id];
  if (!p) return;
  // 自动填 baseUrl
  if (id !== "custom") $("baseUrl").value = p.baseUrl;
  else $("baseUrl").value = "";
  // 填模型下拉（先填预设）
  const sel = $("modelSel");
  sel.innerHTML = "";
  if (p.models.length) {
    for (const m of p.models) {
      const opt = document.createElement("option");
      opt.value = m.id; opt.textContent = m.label;
      sel.appendChild(opt);
    }
  } else {
    sel.innerHTML = '<option value="">请填入模型名</option>';
  }
  // 加载已保存
  const s = await loadSettings();
  if (p.models.some(m => m.id === s.model)) sel.value = s.model;
  else if (p.models.length) sel.value = p.defaultModel;
}

async function onDetectModels() {
  const id = $("providerSel").value;
  const apiKey = $("apiKey").value.trim();
  const baseUrl = $("baseUrl").value.trim() || PROVIDERS[id]?.baseUrl;
  if (!apiKey) return alert("请先填 API Key");
  $("detectBtn").textContent = "检测中…";
  $("detectBtn").disabled = true;
  try {
    const ids = await listModels({ baseUrl, apiKey, providerId: id });
    const sel = $("modelSel");
    const cur = sel.value;
    sel.innerHTML = "";
    for (const mid of ids) {
      const opt = document.createElement("option");
      opt.value = mid; opt.textContent = mid;
      sel.appendChild(opt);
    }
    if (ids.includes(cur)) sel.value = cur;
    $("detectHint").textContent = "✅ 找到 " + ids.length + " 个模型";
  } catch (e) {
    $("detectHint").textContent = "❌ " + e.message;
  } finally {
    $("detectBtn").textContent = "检测可用模型";
    $("detectBtn").disabled = false;
  }
}

async function onSaveSettings() {
  const s = {
    provider: $("providerSel").value,
    apiKey: $("apiKey").value.trim(),
    baseUrl: $("baseUrl").value.trim(),
    model: $("modelSel").value.trim() || $("modelSel").options[0]?.value || "",
    reasoningEffort: $("reasoningSel").value,
    ctxBudget: parseInt($("ctxBudget").value) || 8000,
    temperature: parseFloat($("temperature").value) || 0.7,
    maxTokens: parseInt($("maxTokens").value) || 2048,
    autoMemory: $("autoMemory").checked
  };
  await saveSettings(s);
  $("saveSettingsBtn").textContent = "✓ 已保存";
  await renderModeBanner();
  setTimeout(() => $("saveSettingsBtn").textContent = "💾 保存设置", 1500);
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
    if (!confirm("确定清空全部数据？此操作不可恢复！")) return;
    await T.wipeAll();
    localStorage.removeItem("todoapp.tasks");
    await kvSet("migratedTodoV1", true);
    state.sessionId = null;
    await ensureSession();
    await renderChat();
    closeSheets();
  };
  // M1 新增
  $("providerSel").addEventListener("change", onProviderChange);
  $("detectBtn").onclick = onDetectModels;
  $("saveSettingsBtn").onclick = onSaveSettings;
  $("toggleKeyBtn").onclick = () => {
    const k = $("apiKey");
    k.type = k.type === "password" ? "text" : "password";
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
  await renderModeBanner();
})();
