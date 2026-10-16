// usage.js —— 用量统计：每次 LLM 调用的 tokens + 耗时，按模型聚合
import { open, getAll, put, del } from "./db.js?v=5";

const STORE = "usage";

export async function logUsage({ model, prompt = 0, completion = 0, ms = 0, ts = Date.now() }) {
  await open();
  const r = { id: "u_" + ts + "_" + Math.random().toString(36).slice(2, 8), model, prompt, completion, ms, ts };
  await put(STORE, r);
  // 截断到最近 1000 条
  const all = await getAll(STORE);
  if (all.length > 1000) {
    all.sort((a, b) => a.ts - b.ts);
    for (const x of all.slice(0, all.length - 1000)) await del(STORE, x.id);
  }
  return r;
}
export async function getUsageStats() {
  await open();
  const all = await getAll(STORE);
  const today = new Date(); today.setHours(0,0,0,0);
  const todayKey = today.getTime();
  const byModel = {};
  let totalPrompt = 0, totalCompletion = 0, todayPrompt = 0, todayCompletion = 0, todayCount = 0;
  for (const r of all) {
    const b = byModel[r.model] || (byModel[r.model] = { prompt: 0, completion: 0, count: 0 });
    b.prompt += r.prompt; b.completion += r.completion; b.count += 1;
    totalPrompt += r.prompt; totalCompletion += r.completion;
    if (r.ts >= todayKey) { todayPrompt += r.prompt; todayCompletion += r.completion; todayCount += 1; }
  }
  return { totalPrompt, totalCompletion, todayPrompt, todayCompletion, todayCount, byModel, total: all.length };
}
export async function clearUsage() {
  await open();
  return (await getAll(STORE)).reduce((_, x) => del(STORE, x.id), Promise.resolve());
}
