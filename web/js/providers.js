// providers.js —— 供应商预设 + 通用 OpenAI 兼容 fetcher（含 SSE 流式解析 + 错误归因）
import { kvGet, kvSet } from "./db.js?v=5";

export const PROVIDERS = {
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
    models: [
      { id: "deepseek-chat", label: "deepseek-chat（普通对话）" },
      { id: "deepseek-reasoner", label: "deepseek-reasoner（深度推理）" }
    ],
    modelsPath: "/models",
    chatPath: "/chat/completions",
    headers: {},
    reasoning: "model"   // 切 model 切换
  },
  glm: {
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    models: [
      { id: "glm-4-flash", label: "glm-4-flash（快速便宜）" },
      { id: "glm-4-air", label: "glm-4-air" },
      { id: "glm-4-plus", label: "glm-4-plus" },
      { id: "glm-4.6", label: "glm-4.6（支持 thinking）" }
    ],
    modelsPath: "/models",
    chatPath: "/chat/completions",
    headers: {},
    reasoning: "param"  // 通过 thinking 参数切换
  },
  kimi: {
    label: "Kimi 月之暗面",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-8k",
    models: [
      { id: "moonshot-v1-8k", label: "moonshot-v1-8k" },
      { id: "moonshot-v1-32k", label: "moonshot-v1-32k" },
      { id: "moonshot-v1-128k", label: "moonshot-v1-128k" }
    ],
    modelsPath: "/models",
    chatPath: "/chat/completions",
    headers: {},
    reasoning: "model"
  },
  qwen: {
    label: "通义 Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-turbo",
    models: [
      { id: "qwen-turbo", label: "qwen-turbo（最快）" },
      { id: "qwen-plus", label: "qwen-plus" },
      { id: "qwen-max", label: "qwen-max（最强）" }
    ],
    modelsPath: "/models",
    chatPath: "/chat/completions",
    headers: {},
    reasoning: "param"  // enable_thinking 参数
  },
  custom: {
    label: "自定义 OpenAI 兼容",
    baseUrl: "",
    defaultModel: "",
    models: [],
    modelsPath: "/models",
    chatPath: "/chat/completions",
    headers: {},
    reasoning: "model"
  }
};

export const DEFAULT_SETTINGS = {
  provider: "deepseek",
  apiKey: "",
  baseUrl: PROVIDERS.deepseek.baseUrl,
  model: PROVIDERS.deepseek.defaultModel,
  reasoningEffort: "normal",   // normal | deep
  ctxBudget: 8000,
  temperature: 0.7,
  maxTokens: 2048,
  autoMemory: true
};

export async function loadSettings() {
  const raw = await kvGet("settings");
  return { ...DEFAULT_SETTINGS, ...(raw || {}) };
}
export async function saveSettings(s) {
  const merged = { ...(await loadSettings()), ...s };
  await kvSet("settings", merged);
  return merged;
}

/* 错误归因：根据 fetch 失败/响应状态推断原因 */
function classifyError(err, status, body) {
  if (err?.name === "TypeError" && /fetch/i.test(err.message)) {
    return "网络/浏览器拦截：常见原因①断网 ②供应商 CORS 不允许浏览器直连 ③DNS 解析失败";
  }
  if (status === 401 || status === 403) return "鉴权失败：API Key 无效或权限不足";
  if (status === 404) return "端点不存在：请检查 baseUrl 与模型名";
  if (status === 429) return "请求被限流：稍后再试";
  if (status === 400) return `请求格式错误：${(body?.error?.message || "").slice(0, 120)}`;
  if (status >= 500) return `服务端错误（${status}）：供应商侧问题`;
  return `未知错误（${status}）`;
}

/* 拉取模型列表 */
export async function listModels({ baseUrl, apiKey, providerId }) {
  const p = PROVIDERS[providerId] || {};
  const url = (baseUrl || p.baseUrl || "").replace(/\/+$/, "") + p.modelsPath;
  if (!url || !apiKey) throw new Error("缺少 baseUrl 或 API Key");
  let res, body, err;
  try {
    res = await fetch(url, { headers: { Authorization: "Bearer " + apiKey } });
  } catch (e) { err = e; }
  if (err) throw new Error(classifyError(err));
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) throw new Error(classifyError(null, res.status, body));
  const ids = (body?.data || []).map(m => m.id).filter(Boolean);
  if (!ids.length) throw new Error("返回为空：该供应商可能不提供 /models 端点，请手动填写模型名");
  return ids;
}

/* 通用 chat completions（流式）
   onDelta(text): 每收到一段文本回调
   onDone({usage, fullText}): 结束回调（usage 可能为 null）
   onError(msg): 错误回调
   返回 Promise<{fullText, toolCalls, usage}>
   toolCalls 累积为 [{id, name, argsJson}]  */
export async function streamChat({
  baseUrl, apiKey, model, messages, tools, temperature, maxTokens, reasoningEffort, providerId,
  signal
}) {
  const p = PROVIDERS[providerId] || {};
  const url = (baseUrl || p.baseUrl || "").replace(/\/+$/, "") + p.chatPath;
  const body = {
    model,
    messages,
    stream: true,
    temperature,
    max_tokens: maxTokens
  };
  // 工具
  if (tools && tools.length) body.tools = tools;
  // 推理参数
  if (providerId === "qwen" && reasoningEffort === "deep") body.enable_thinking = true;
  if (providerId === "glm" && reasoningEffort === "deep") {
    body.thinking = { type: "enabled" };
  }
  // deepseek 切 model 已经在 model 字段上

  let res;
  try { res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey
    },
    body: JSON.stringify(body),
    signal
  }); }
  catch (e) { throw new Error(classifyError(e)); }
  if (!res.ok) {
    let errBody = null;
    try { errBody = await res.json(); } catch {}
    throw new Error(classifyError(null, res.status, errBody));
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder("utf-8");
  let buf = "";
  let fullText = "";
  const toolCallsMap = new Map();   // index -> {id, name, argsBuf}
  let usage = null;
  let finishReason = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const evt = buf.slice(0, i).trim();
      buf = buf.slice(i + 2);
      for (const line of evt.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        let chunk; try { chunk = JSON.parse(payload); } catch { continue; }
        const choice = chunk.choices?.[0];
        if (!choice) {
          if (chunk.usage) usage = chunk.usage;
          continue;
        }
        const delta = choice.delta || {};
        if (delta.content) fullText += delta.content;
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const slot = toolCallsMap.get(idx) || { id: "", name: "", argsBuf: "" };
            if (tc.id) slot.id = tc.id;
            if (tc.function?.name) slot.name += tc.function.name;
            if (tc.function?.arguments) slot.argsBuf += tc.function.arguments;
            toolCallsMap.set(idx, slot);
          }
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
        if (chunk.usage) usage = chunk.usage;
      }
    }
  }
  const toolCalls = [...toolCallsMap.values()].map(tc => ({
    id: tc.id, name: tc.name, args: safeParseArgs(tc.argsBuf)
  })).filter(tc => tc.name);
  return { fullText, toolCalls, usage, finishReason };
}

function safeParseArgs(s) {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}
