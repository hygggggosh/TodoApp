// agent.js —— M0 规则引擎版 Agent：无 Key 也全能操作任务/记忆/记录
// M1 会替换为 LLM function-calling 循环，但底层工具（tools.js）完全复用
import * as T from "./tools.js?v=3";

const MODE_NOTE = "（离线规则模式 · 配置 AI 后按原话说一遍即可获得更聪明的回答）";

function fmtTasks(rows) {
  if (!rows.length) return "任务列表是空的。";
  return rows.map((t, i) =>
    `${i + 1}. ${t.done ? "✅" : "⬜️"} ${t.title}${t.due ? "（截⽌：" + t.due.slice(0, 10) + "）" : ""}${t.note ? " — " + t.note : ""}`
  ).join("\n");
}

function fmtDate(d) {
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
}

export const hooks = { export: null, open: null };

/* 意图规则表：按顺序首个匹配执行 */
const rules = [
  {
    name: "time",
    match: /^(现在)?(几点|几号|什么日期|今天日期|什么时间)/,
    run: async () => {
      const d = new Date();
      return `现在是 ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}，${fmtDate(d)}。`;
    }
  },
  {
    name: "task.add",
    match: /^(添加任务|加个任务|加任务|新建任务|提醒我)[:：\s]?\s*(.+)/,
    run: async (m) => {
      const t = await T.addTask({ title: m[2].trim() });
      return `已添加任务：「${t.title}」。\n${MODE_NOTE}`;
    }
  },
  {
    name: "task.done",
    match: /^(完成|弄完)[:：\s]?\s*(.+)/,
    run: async (m) => {
      const rows = await T.findTasks(m[2]);
      if (!rows.length) return `没找到「${m[2].trim()}」相关任务。`;
      const t = rows[0];
      if (t.done) return `「${t.title}」本来就是已完成状态。`;
      await T.toggleTask(t.id);
      return `已完成任务：「${t.title}」。`;
    }
  },
  {
    name: "task.delete",
    match: /^(删除任务|删掉任务|移除任务)[:：\s]?\s*(.+)/,
    run: async (m) => {
      const rows = await T.findTasks(m[2]);
      if (!rows.length) return `没找到「${m[2].trim()}」相关任务。`;
      await T.deleteTask(rows[0].id);
      return `已删除任务：「${rows[0].title}」。`;
    }
  },
  {
    name: "task.list",
    match: /^(看|查|显示|打开)?(我的)?(任务|待办)(列表)?(怎么样|看看)?$/i,
    run: async () => `你的任务：\n${fmtTasks(await T.listTasks())}`
  },
  {
    name: "task.pendingcount",
    match: /(剩下|还有|共)(多少|几)(件|个|条)?(任务|待办|事)/,
    run: async () => {
      const n = await T.countPending();
      return n ? `还有 ${n} 个未完成任务，说「看任务」可以查看。` : "所有任务都已完成 🎉";
    }
  },
  {
    name: "memory.add",
    match: /^(记住|记一下)[:：\s]?\s*(.+)/,
    run: async (m) => {
      await T.addMemory(m[2].trim(), "manual");
      return `记住了：「${m[2].trim()}」。以后你问我时我都能想起来。`;
    }
  },
  {
    name: "memory.list",
    match: /(你(知道|记得)(这些|什么|哪些)|看(一?下)?记忆|记忆(库)?(列表)?)/,
    run: async () => {
      const ms = await T.listMemories();
      if (!ms.length) return "记忆库还是空的。开口说「记住：xxx」就会留下记忆。";
      return `我记得这些（${ms.length} 条）：\n` + ms.slice(0, 10).map(m => "· " + m.text).join("\n");
    }
  },
  {
    name: "entry.add",
    match: /^(记录|记一笔)[:：\s]?\s*(.+)/,
    run: async (m) => {
      await T.addEntry(m[2].trim());
      return `已记录。想找它的时候说「查 ${m[2].trim().slice(0, 6)}」。`;
    }
  },
  {
    name: "search",
    match: /^(查|搜索|找)(一下)?[:：\s]?\s*(.+)/,
    run: async (m) => {
      const kw = m[3];
      const [entries, tasks] = await Promise.all([T.searchEntries(kw), T.findTasks(kw)]);
      const parts = [];
      if (tasks.length) parts.push("相关任务：\n" + tasks.map(t => `· ${t.done ? "✅" : "⬜️"} ${t.title}`).join("\n"));
      if (entries.length) parts.push("相关记录：\n" + entries.slice(0, 5).map(e => "· " + e.text).join("\n"));
      return parts.length ? parts.join("\n\n") : `没有找到与「${kw}」相关的内容。`;
    }
  },
  {
    name: "briefing",
    match: /^(简报|总结|今日简报|今天(怎么样|过得如何))/,
    run: async () => {
      const pending = await T.listTasks({ includeDone: false });
      const entries = await T.listEntries(7);
      const lines = [`📌 ${fmtDate(new Date())}`, "", `未完成任务 ${pending.length} 个：`];
      lines.push(pending.length ? pending.slice(0, 5).map(t => `· ${t.title}`).join("\n") : "· 无 🎉");
      const logs = entries.filter(e => e.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10));
      lines.push("", `今天的记录 ${logs.length} 条`);
      return lines.join("\n");
    }
  },
  {
    name: "export",
    match: /^(导出数据|导出|备份数据)/,
    run: async () => {
      if (hooks.export) hooks.export();
      return "已生成 JSON 备份文件并开始下载，可在网盘或文件 App 里保管。";
    }
  },
  {
    name: "open.ui",
    match: /^(打开|显示)(任务面板|记忆库|设置)/,
    run: async (m, ctx) => {
      const map = { 任务面板: "tasks", 记忆库: "memories", 设置: "settings" };
      const target = Object.keys(map).find(k => m[0].includes(k));
      hooks.open && hooks.open(map[target]);
      return `已为你打开${target}。`;
    }
  }
];

const FALLBACK = [
  "收到。不过当前处于离线规则模式，只能执行：\n· 任务：添加任务：xx / 完成：xx / 删除任务：xx / 看任务\n· 记忆：记住：xx / 你记得哪些\n· 记录：记录：xx / 查：xx\n· 工具：简报 / 导出数据 / 现在几点\n\n去设置里配置 AI 模型后，同样的话就能得到聪明的回答。",
  "这条我还不太会按规则处理。" + MODE_NOTE
];

export async function handle(text) {
  const clean = text.trim();
  if (!clean) return null;
  for (const rule of rules) {
    const m = clean.match(rule.match);
    if (m) return rule.run(m);
  }
  return FALLBACK[clean.length % FALLBACK.length];
}
