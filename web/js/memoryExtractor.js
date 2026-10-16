// memoryExtractor.js —— 长期记忆自动提取：每次 assistant 回复后异步发起
import { listMessages, addMemory, listMemories } from "./tools.js?v=6";
import { loadSettings } from "./providers.js?v=6";
import { streamChat } from "./providers.js?v=6";

const EXTRACT_PROMPT = `从下列对话中提取**值得长期记住**的"事实/偏好/约定"。要求：\n` +
  `1. 必须是用户的明确陈述（不是助手承诺、不是临时事项）\n` +
  `2. 输出 JSON 数组：[{text, importance: 1-3}]，不相关时输出 []\n` +
  `3. 单条 1-30 字，避免重复\n` +
  `4. 仅输出 JSON，不要任何额外文字。`;

export async function maybeExtractMemories(sessionId) {
  const s = await loadSettings();
  if (!s.apiKey || !s.autoMemory) return;
  const msgs = await listMessages(sessionId);
  if (msgs.length < 2) return;
  // 只取最后 6 条 user+assistant 对
  const slice = msgs.filter(m => m.role === "user" || m.role === "assistant").slice(-6);
  const convo = slice.map(m => `${m.role === "user" ? "你" : "我"}：${m.content}`).join("\n");
  const messages = [
    { role: "system", content: EXTRACT_PROMPT },
    { role: "user", content: convo }
  ];
  // 收集已有记忆去重
  const existing = (await listMemories(200)).map(m => m.text);
  let res;
  try {
    res = await streamChat({
      baseUrl: s.baseUrl, apiKey: s.apiKey, model: s.model, messages,
      temperature: 0.2, maxTokens: 400, reasoningEffort: "normal", providerId: s.provider
    });
  } catch { return; }
  let parsed;
  try { parsed = JSON.parse(res.fullText); } catch { return; }
  if (!Array.isArray(parsed)) return;
  for (const item of parsed) {
    if (!item || !item.text || typeof item.text !== "string") continue;
    const txt = item.text.trim();
    if (!txt || txt.length > 60) continue;
    if (existing.some(e => e.toLowerCase() === txt.toLowerCase())) continue;
    await addMemory(txt, "auto");
  }
}
