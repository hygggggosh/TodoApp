// llmAgent.js —— LLM Agent：function-calling 循环 + 流式输出
import * as T from "./tools.js?v=4";
import { streamChat, loadSettings } from "./providers.js?v=4";
import { logUsage } from "./usage.js?v=4";

const SYSTEM_PROMPT = `你是 Muse，一位本地优先的个人助手。\n` +
  `规则：\n` +
  `1. 用户要求新建任务/记录/记忆时，必须调用相应工具，不可在文字里"假装"已加。\n` +
  `2. 用户要求打开地图/生成日历邀请时，调用 ics_generate 或 maps_open 并把生成的内容呈现给用户。\n` +
  `3. 简报/统计/查询时优先调工具拉真实数据，再总结。\n` +
  `4. 回答简短、有条理，能列表就别写长段。\n` +
  `5. 称呼用户为"你"；不主动提及自己的训练数据。`;

export async function llmHandle({ sessionId, history, onDelta, onTool, onAction, signal }) {
  const s = await loadSettings();
  if (!s.apiKey) return { ok: false, fallback: true, reason: "no_api_key" };

  // 构造 messages：system + 截取历史
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];
  // 上下文预算：粗略按 char/2 估算
  const budget = s.ctxBudget || 8000;
  let used = SYSTEM_PROMPT.length;
  const recent = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    const len = (m.content || "").length + (JSON.stringify(m.toolCalls || [])).length;
    if (used + len > budget) break;
    recent.unshift({
      role: m.role,
      content: m.content || "",
      ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
      ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {})
    });
    used += len;
  }
  for (const r of recent) messages.push(r);

  const tools = T.TOOL_SCHEMAS;
  let finalText = "";
  let usedTokens = null;
  const actions = [];

  for (let round = 0; round < 8; round++) {
    const t0 = performance.now();
    let res;
    try {
      res = await streamChat({
        baseUrl: s.baseUrl, apiKey: s.apiKey, model: s.model, messages, tools,
        temperature: s.temperature, maxTokens: s.maxTokens, reasoningEffort: s.reasoningEffort,
        providerId: s.provider, signal
      });
    } catch (e) {
      return { ok: false, error: e.message || String(e), text: finalText };
    }
    const ms = performance.now() - t0;
    if (res.usage) usedTokens = res.usage;
    logUsage({ model: s.model, prompt: res.usage?.prompt_tokens || 0, completion: res.usage?.completion_tokens || 0, ms, ts: Date.now() });

    finalText = res.fullText;
    if (res.fullText && onDelta) onDelta(res.fullText);

    if (!res.toolCalls.length) break;

    // 把 assistant 的 tool_calls 写入消息历史
    messages.push({
      role: "assistant",
      content: res.fullText || "",
      tool_calls: res.toolCalls.map((tc, i) => ({
        id: tc.id || ("call_" + round + "_" + i),
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.args) }
      }))
    });

    for (const tc of res.toolCalls) {
      if (onTool) onTool(tc);
      const r = await T.executeTool(tc.name, tc.args);
      if (onAction) onAction({ tool: tc.name, args: tc.args, result: r });
      if (r.action === "create_task" || r.action === "create_entry" || r.action === "create_memory" || r.action === "ics" || r.action === "maps" || r.action === "delete_task" || r.action === "toggle_task") {
        actions.push({ tool: tc.name, result: r });
      }
      messages.push({
        role: "tool",
        tool_call_id: tc.id || ("call_" + round),
        content: JSON.stringify(summarizeResult(r))
      });
    }
  }

  return { ok: true, text: finalText || "（无回复内容）", actions, tokens: usedTokens };
}

function summarizeResult(r) {
  if (!r) return "{}";
  if (r.action === "list_tasks") return JSON.stringify({ count: r.data.length, titles: r.data.slice(0, 10).map(t => t.title + (t.done ? "✅" : "")) });
  if (r.action === "list_memories") return JSON.stringify({ count: r.data.length, texts: r.data.slice(0, 10).map(m => m.text) });
  if (r.action === "search_entry") return JSON.stringify({ count: r.data.length, items: r.data.slice(0, 5).map(e => e.text.slice(0, 60)) });
  if (r.action === "ics") return JSON.stringify({ filename: r.data.filename, dataUrl: r.data.dataUrl, hint: "请告诉用户点击下载并打开'添加到日历'" });
  if (r.action === "maps") return JSON.stringify({ url: r.data.url, hint: "请告诉用户点击链接会自动拉起 Apple Maps" });
  if (r.data && r.data._undo) return JSON.stringify({ summary: r.summary, undo: r.data._undo });
  return JSON.stringify(r.data || { summary: r.summary });
}
