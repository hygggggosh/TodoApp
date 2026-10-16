# Personal Agent（对标 Meta Muse）— PWA 规划 v0.5

> 状态：v0.5（模型接入中心 + **iOS 原生集成分层**）
> 形态：纯前端 PWA，GitHub Pages 托管（沿用现有 CI），主功能零依赖、无后端
> 决策记录：AI=BYO Key 直连 / **国内供应商预设+连通检测+参数可调** / 取代旧清单 / 暂不同步 / 对话为主 / 云服务器=可插拔增强

---

## 0. 总原则（不变量）

1. **Local-first 不可妥协**：没有云服务器、没有 API Key，核心功能 100% 可用
2. 云能力一律是**增强**（enhancement），不是依赖：随时可在设置里添加/停用/移除
3. 用户数据永远先落本机；任何云端通道只传「必要的最小载荷」

## 1. 产品形态（对话为主，四层）

```
对话流 → 记忆库 → 检索/统计 → 任务/日程/简报
（本地 by default，云端只扩展"触达"和"运行时机"）
```

## 2. 调研结论（Meta 的 Muse）→ 我们的复刻边界

- Muse：云端 VM + 内置浏览器替用户上网跑腿 + 长期记忆 + 接入邮箱日历
- 我们无云也能做：对话 agent、本地记忆、任务/日程管理、检索统计、简报、数据资产
- 我们无云做不到：系统级推送、后台定时跑、Email 等浏览器禁区
- **云服务器的价值恰好填平这三块** → 设计为可选购的"通道与执行器"

## 3. 能力分级矩阵（v0.3 核心新增）

| 能力 | 无 Key | 有 LLM Key | + 云服务器 |
|------|--------|-----------|-----------|
| 对话 agent（拆解/总结/规划） | 规则引擎兜底 | ✅ 流式生成 | ✅ 同左 |
| 任务/日程 CRUD | ✅ | ✅ | ✅ |
| 本地记忆库（自动提取/编辑） | 手动管理 | ✅ 自动提取 | ✅ |
| 全文检索/统计 | ✅ | ✅ 更聪明 | ✅ |
| 每日简报 | 打开时规则版 | 打开时 LLM版 | **✅ 定时生成并推送** |
| 提醒通知 | 打开时扫描 | 打开时扫描 | **✅ 真·系统通知（Web Push）** |
| 网络跑腿（预订/查价…） | ❌ | 引用式建议 | **✅ 服务器上无头浏览器代办事**（高级，可选装） |
| 数据同步/备份 | 导出 JSON | 同左 | **✅ 上传服务器存档**（可选通道） |

## 4. 云扩展协议（Bridge，v1 草案）

用户侧：设置里填 `Bridge URL + 共享密钥`，一键探测可用能力，逐项开关。

Bridge 自身 = 体积极小的自托管服务（Node/Python 单文件 + Docker Compose 提供），三通道：

| 通道 | 端点 | 用途 | 实现要点 |
|------|------|------|---------|
| ① 推送通知 | POST /notify | Web Push 触达 iOS/桌面 | Node `web-push` + VAPID，iOS 16.4+ 已装 PWA 即收；载荷只含标题+id，详情回拉本地 |
| ② 定时任务 | POST /tick | 每日简报/提醒到期触发 | Bridge cron 调 Agent 组装简报 → 推送；对话仍由手机端渲染 |
| ③ 任务执行器 | POST /run | （高级可选）无头浏览器跑多步网页任务 | Playwright 沙箱 + 操作审计日志；仅显式启用 |

安全底线：
- HTTPS + 密钥握手；Bridge 不落库个人数据（通知队列外全部无状态）
- PWA 内每个通道显示「最后连通时间 + 发送记录」；一键撤销重滚
- 无 Bridge 时相应能力灰显示 → 不算错误，不弹窗打扰

## 5. iOS 原生集成（v0.5 新增，按平台现实分层）

对标 Muse 的「接入你的邮箱/日历」，但浏览器沙箱读不到系统应用，按三层诚实设计：

### 5.1 现在就能做（无 Key、无云、纯 PWA）

| 对象 | 能力 | 实现 |
|------|------|------|
| 日历 Calendar | 单事件**一键加进系统日历** | 生成 `.ics` → Safari 下载 → iOS 原生导入面板 |
| 日历 Calendar | 日程快照给 Agent（用户每次打开手动授权的当前位置/时间即可） | 事件数据由本 app 自管，非系统日历直读 |
| 地图 Maps | Agent 生成地点后**跳转 Apple Maps 导航/搜索** | `maps.apple.com/?daddr=…` 深链，原生地图直接拉起 |
| 地图 Maps | 定位当前坐标（用户点一下授权一次） | 标准 Geolocation API |
| 备忘录 Notes | 导出到备忘录 | 系统分享面板（Web Share API）→ 用户选备忘录 |
| 备忘录 Notes | 反向导入 | 用户从备忘复制 → 粘贴进对话/记录页，Agent 自动结构化 |

（iOS 对第三方网页应用没有系统日历/备忘录的**直读**权限，深链+文件导出是官方允许的全部通道，下同）

### 5.2 云 Bridge 后解锁（可选，用户有服务器才启用）

| 能力 | 方案 |
|------|------|
| **系统日历双向同步** | 服务器走 CalDAV 连 iCloud 日历（App 专用密码）；手机上的日历动作变成"本地排队→云端执行" |
| 日历驱动的提醒/简报 | 服务器读日历 → 结合任务生成晨报/临期提醒 → Web Push |
| 邮件族接通 | 同模式扩展 IMAP（评审后再做，默认不开） |

### 5.3 平台明确不开放（付费也不行，如实告知）

- **Apple 备忘录没有任何官方 API**（连原生 App 开发者都要走分享面板或去 iCloud 网页抓）→ 以本 app 内置 `entry` 记录作为第一公民，备忘录只做出入口
- 直接改写系统日历/通讯录而无需用户逐次确认，浏览器不可行；5.2 方案本质是"你的服务器替你持有 iCloud 授权"，权限归你控制

## 6. 模型接入中心（v0.4 新增，M1 优先落地）

Agent 的「聪明程度」全部从这一页开始，配好即有、配错不崩：

### 5.1 供应商预设

| 预设 | Base URL | 内置模型族 | 推理方式 |
|------|----------|-----------|---------|
| DeepSeek | api.deepseek.com | deepseek-chat / deepseek-reasoner | 切换 reasoner 模型 |
| 智谱 GLM | open.bigmodel.cn/api/paas/v4 | glm-4.x / glm-x.x-thinking（含 flash 档） | `thinking.type` 参数 |
| Kimi 月之暗面 | api.moonshot.cn/v1 | k2 系列 | k2-turbo / k2-thinking 模型 |
| 通义 Qwen | dashscope.aliyuncs.com/compatible-mode/v1 | qwen-max/plus/flash | `enable_thinking` 参数 |
| 自定义 OpenAI 兼容 | 任意 | 任意 | 交由「自定义推理参数」暴露 |

内置预设只存 Base URL 和参数习惯；**Key、模型名由用户填/选**，随时可改。

### 5.2 接入流程（向导式）

1. 选供应商（或自定义）→ 填 Key
2. **一键检测**：① GET `/models` 列出可用模型并自动填充下拉 → ② 发一枚极小 token 的请求测连通和延迟 → ③ 给出 ✅/❌ 明确结论和建议（Key 无效 / 端点不可达 / CORS 拒绝→提示跨域原因）
3. 选模型（从检测结果里选，或手输）
4. 保存后随时可再检

### 5.3 可调参数（低频、藏进「高级」）

| 参数 | 含义 | 默认 |
|------|------|------|
| **推理等级** | 每个供应商映射不同：reasoner 模型切换 / thinking 参数 / reasoning_effort（低中高） | 普通档 |
| **上下文预算** | 每轮最多带给模型的历史+记忆+任务快照 token 上限（k 档位滑条） | 8k，自适应收紧 |
| 温度 | 随机度 | 0.7（工具调用时自动降到 0.2） |
| 最大回复 token | 输出上限 | 2k |

- 上下文组装顺序固定：系统提示 → 长期记忆命中 → 任务/日程快照 → 近期对话（超预算从最旧对话开始压缩）
- 用量可见：每次回复显示 tokens 与耗时（累计到设置页统计里）

### 5.4 降级与容错

- 检测不通过 → 绿色回到规则版 Agent，任务 CRUD 等功能照常，聊天里明示「当前为离线规则模式」
- 请求失败自动重试 1 次；连败则本轮降级规则模式并在下一轮可一键重连
- Key 仅存本机 localStorage；卸载/清数据即消失

## 7. Agent 工具集

**本地工具（永远可用）**：task CRUD / entry create+search / memory remember+recall / date calc / briefing.daily / data export-import / **calendar.ics**（生成可导入系统日历的事件）/ **maps.open**（Apple Maps 深链导航）/ **share.out**（调系统分享到备忘录等）
**云端工具（探测到 Bridge 才出现）**：notify.send / schedule.set / calendar.sync(CalDAV) / (可选) web.run
模型经「模型接入中心」配置（见 §5），未配置时规则引擎兜底。

## 8. 数据模型

```jsonc
tasks / entries / memories / messages  // 同 v0.2，全 IndexedDB
settings: { provider, apiKey, baseUrl, model, thinking, ctxBudget, bridge: { url, token, caps:{ notify, tick, run } } }
```

## 9. 里程碑

**M0 数据底座 + 对话壳**（零 Key、零云，全部功能触手可及）
- [ ] IndexedDB 数据层（tasks/entries/memories/messages/settings）
- [ ] 对话 UI + 会话列表；规则版 Agent 全功能操作任务
- [ ] 旧清单数据自动迁移；旧页面归档 /legacy/
- [ ] Pages 部署替换 web/

**M1 真 Agent**
- [ ] **模型接入中心**（§5）：国内供应商预设 / 一键检测+模型列表 / 推理等级与上下文预算
- [ ] BYO Key 流式对话 + function-calling 循环 + 六类本地工具
- [ ] 动作卡片（可撤销）+ 长期记忆自动提取 + 记忆库管理页
- [ ] 用量统计（tokens/耗时）

**M2 妥善化**
- [ ] 每日简报卡片（打开时）+ **iOS 原生集成三通**：.ics 导出日历 / Apple Maps 深链导航 / 分享到备忘录
- [ ] Bridge 设置页（探测/开关/连通状态 UI 先行，无后端即显示"未连接"）

**M3 云扩展（可选，用户有服务器才上）**
- [ ] Bridge 单文件服务端（notify + tick 两通道，Docker Compose 一条命令部署）
- [ ] Web Push 全链路（装了 PWA 的 iPhone 锁屏真通知）+ 定时简报
- [ ] **CalDAV 连 iCloud 日历双向同步**（App 专用密码，用户自己的服务器持有授权）
- [ ] （进阶可选）web.run 无头浏览器执行器 + 审计
