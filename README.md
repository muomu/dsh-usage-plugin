# dsh-usage-tokens

DSH Web 侧边栏的「今日 Token 用量」按钮。按钮显示当天消耗的 token 总量，点击后弹窗给出选定时间范围的用量：选定范围内的**时间分布**（单日按小时、更宽的范围按天）与**按模型 / 供应商拆分**。

数据全部来自本机的逐次模型调用记录，不联网、不读取任何第三方插件的账本。

## 功能

**侧边栏按钮**（`sidebar.footer.action`，位于设置按钮旁）

- 展开时显示「今日 Token 用量」文字与数字，折叠成 56px 图标栏时只显示图标，数字移入悬停提示。
- 数字口径为 `input + output + cacheRead + cacheWrite`，与 DeepSeek 平台用量页的「总 Tokens」一致。
- 数字始终是**今天**，与弹窗里选中的范围无关。
- 紧凑格式（`162.4M` / `814k`），保证按钮宽度不随数量增长而抖动。

**弹窗**（居中 modal，`Esc` / 点击遮罩 / 关闭按钮均可关闭，焦点被困在弹窗内）

- **时间范围**：预设「今天 / 昨天 / 近 7 天 / 近 30 天」+ 两个日期输入框自定义起止日期；最长一年，超出部分按最近的日期截断，起止填反了会自动交换。
- **切片规则只有一条**：范围落在同一个本地自然日（今天、昨天，或自定义成同一天）就切成 24 小时，其余一律按天。没有粒度开关，也就没有开关和范围对不上的可能；表格标题会写明当前是「按小时」还是「按天」。
- 六张卡片与缓存命中率都跟着选中的范围走。
- **按模型 / 供应商拆分表**：当前范围的整体拆分，可切换两种口径，末行为合计。
- **时间分布表**：一行一个时段，**新的在前**，每行带一条占本表峰值的比例条。只列出**有调用**的时段——安静的小时或整天不占一行（合计行本身就是它们的信息），因此这张表是稠密的，时段之间的空档不代表范围缺失。宿主只在时段有调用时才下发它，浏览器端还会再过滤一次，所以宿主尚未重启时看到的同样是一张稠密表。末行为合计，且恒等于各行之和。

## 数据来源与口径

| 来源 | 用途 |
|---|---|
| `llm/stream` 瀑布流 | 实时捕获每次调用，取 `{type:'usage'}` chunk |
| `$DSH_HOME/sessions/*/*/session[.vN].jsonl[.zstd]` | 首次安装时一次性回填历史 |

三个必须注意的口径细节：

1. **桶是不相交的。** `inputTokens` 只是未命中缓存的输入，缓存命中另计 `cacheReadTokens` / `cacheWriteTokens`。这与 DSH 会话日志的字段名一致。
2. **`reasoningTokens` 是 `outputTokens` 的子集**，只用于单独展示，绝不重复计入总量。
3. **时间桶是左闭右开的本地时段。** 归属取请求开始时刻，日期边界是本地自然日，小时边界是本地整点；分桶用「这个时刻会生成哪个 key」判断，而不是比较时间戳，因此夏令时地区 23 或 25 小时的那一天也不会漏掉或重复任何一次调用。

**去重**：回填行以 `sessionId` + 事件 `seq` 作为稳定 id，实时行以 `live:<uuid>` 标记并按（模型 + 各桶 + 10 秒窗口）指纹去重。因此重复扫描、重启、以及实时与回填的交叠都不会重复计数。

## 存储

账本：`~/.dsh/storages/dsh-usage-tokens/ledger.json`

```jsonc
{
  "version": 1,
  "backfill": { "done": true, "at": 1790653... },
  "updatedAt": 1790653...,
  "records": [
    {
      "id": "live:8f3c...",       // 或 "backfill:<sessionId>:<seq>"
      "time": 1790652084725,       // 请求开始时刻，epoch ms
      "provider": "deepseek-official",
      "model": "deepseek-flash",
      "sessionId": "session-...",
      "inputTokens": 218,          // 未命中缓存的输入
      "outputTokens": 399,
      "cacheReadTokens": 446208,
      "cacheWriteTokens": 0,
      "reasoningTokens": 0,        // outputTokens 的子集
      "src": "live"                // 或 "backfill"
    }
  ]
}
```

写入采用与其他 DSH 记账插件相同的纪律：防抖 + `tmp` 文件写入后 `rename` + `mkdir` 锁目录（锁的 owner 记录 pid，持有者已退出则视为陈旧锁）。flush 时先重新读取文件再按 id 合并，因此两个 DSH 进程共用该文件也不会互相覆盖。记录上限 20 万条。

## HTTP 接口

`GET /api/dsh-usage-tokens/usage?from=<key>&to=<key>&grain=day|hour`

- `key` 是 `YYYY-MM-DD` 或 `YYYY-MM-DDTHH`（本地时间）。`from` / `to` 都是闭区间；`to` 给日期而 `grain=hour` 时表示那一整天。
- 浏览器端只发两个日期，`grain` 由 `grainForRange` 推出来（同一天 → `hour`，否则 `day`），双方共用这一份实现。
- 不带参数即「今天」，也就是侧边栏按钮每次轮询的请求。
- 参数怎么错都不会 500：无法解析的 key 退回今天，`from` 晚于 `to` 收敛成 `to`，跨度截到最近一年，`grain` 只认 `hour` 这一个字面量，超过 31 天的按小时请求降级为按天并在 `scope.grain` 里如实回答——这条是手改 URL 时的兜底，界面本身只会对单日请求按小时。
- 响应形如：

```jsonc
{
  "ok": true,
  "today": { "date": "2026-09-29", "calls": 2321, "totalTokens": 419000000, "...": 0 },
  "scope": {
    "from": "2026-09-23", "to": "2026-09-29", "grain": "day",
    "fromMs": 1790..., "toMs": 1790...,
    "buckets": [ { "key": "2026-09-29", "start": 1790..., "end": 1790..., "calls": 2321, "totalTokens": 419000000, "...": 0 } ],
    "rows":    [ { "key": "litellm:glm-5.3", "provider": "litellm", "model": "glm-5.3", "calls": 1006, "totalTokens": 201001923, "...": 0 } ],
    "totals":  { "calls": 12739, "totalTokens": 2246262305, "...": 0 },
    "hitRate": 0.91
  },
  "recordCount": 12739,
  "backfilled": true,
  "generatedAt": 1790...,
  "scanning": { "running": false, "sessions": 0, "files": 0, "records": 0, "errors": 0 }
}
```

- 这是 `ctx.webServer` 的裸路由，**没有任何内置认证**，因此自行做了访问控制：仅允许回环地址的对端，且 `Host` / `Origin` 必须是本机地址（防 DNS rebinding）。响应始终 `cache-control: no-store`。
- 首次启动回填期间，响应的 `scanning` 字段会报告进度，前端据此加快轮询，让数字逐步增长而不是最后跳一次。
- `scope.buckets` 只包含有调用的时段（`calls > 0`），按时间倒序；`scope.rows` 是该范围整体按模型汇总，按总计倒序。
- 每次请求都会重新扫一遍账本（本机 4.7 万行约 20–35 ms），所以既没有缓存要失效，也没有会话状态要维护。

## 安装

```bash
cd ~/dsh-usage-plugin && npm install && npm run build
dsh plugin --profile web add link:/path/to/dsh-usage-plugin
```

新增 bundle 需要重启 DSH 才会生效（`patchReload: live` 只覆盖配置改动，不覆盖新增包）。重启后首次启动会扫描全部历史会话，约 677 个日志 / 数秒到数十秒，期间按钮已经可用并显示逐步增长的数字。

**改动 host 半（`src/index.ts` 及以下）后同样需要重启 DSH**：Web 外壳会热重载插件的 `lib/client.js`，但运行中的进程不会重新 import `lib/index.js`。为了这段客户端已更新、宿主还没重启的窗口，浏览器端在 `/usage` 返回 404 / 401（未注册的 `/api/*` 路径由 Web 外壳的鉴权层先拦下）时会退回旧的 `/summary` 接口：弹窗仍显示今天与近 7 天的数字，但范围选择置灰并提示需要重启，而不是报错或显示一段与选择不符的数字。重启后这条回退路径不再触发。

卸载：

```bash
dsh plugin --profile web remove dsh-usage-tokens
```

## 开发

```bash
npm run build        # esbuild：宿主 ESM + 浏览器端 ModuleLoader 包装
npm test             # 70 个用例：聚合/时段边界、回填、账本、路由守卫、客户端取数、jsdom 渲染
npm run scan-report  # 离线跑一遍历史扫描并打印当日与按模型统计
npm run usage-report # 对着真实账本在终端看同一个视图：npm run usage-report 2026-09-23 2026-09-29 [--hour|--day]
npm run verify-day   # 用独立实现复核某一天的 token 总量与日志数
node scripts/verify-day.mjs 2026-09-29
```

`test/modal.test.mjs` 把 `lib/client.js` 按 Web 外壳的方式（`window.__ModuleLoader__`）加载进 jsdom，用真实的 React 18.3.1 挂载弹窗，再模拟点击预设与日期框，因此它要求先 `npm run build`；缺少产物时该文件自行跳过。`react` / `react-dom` / `jsdom` 只是测试期的开发依赖，运行时不打包（浏览器端只 `require` 外壳预置的模块）。

### 四个容易踩的坑

**1. 宿主半不能 import 任何 `@deepseek-ai/*` 包。** profile 里 `link:` 安装的插件是通过符号链接到达的，而 Node 解析模块自身的 import 时用的是**真实路径**而不是符号链接路径。因此 `@deepseek-ai/dsh-home-paths` 这类只存在于 dsh 安装目录里的包无法解析——插件会安装成功、出现在合成配置里，然后**静默地完全不运行**（没有账本，也没有用户可见的报错）。第一版正是栽在这里。现在 `$DSH_HOME` 的解析在 `src/index.ts` 内自行实现，`build.mjs` 在产物中出现 `@deepseek-ai/*` import 时直接构建失败，`test/load.test.mjs` 还会按加载器的方式从符号链接导入一次产物。

**2. 会话日志是多帧 zstd。** `session.v4.jsonl.zstd` 是每次追加一个 zstd 帧拼接而成的。Node 的 `zstdDecompressSync` 默认只解出**第一帧**（在那份开发用的日志上是 211 字节，只有会话头），因此 `src/backfill.ts` 用 `{ info: true }` 逐帧推进直到缓冲区耗尽。`test/backfill.test.mjs` 会把逐帧结果与 `zstd -dc` 的行数对照，以防这个行为回归。

**3. 浏览器端不能 import Harness Client 包。** 插件的浏览器产物必须走模块表，且官方插件开发规范要求插件自己实现控件而不是加载 `@deepseek-ai/dsh-client-ui-primitives`。因此弹窗是手写的 `createPortal` + `role="dialog"` + `aria-modal`，样式全部使用 `--dsw-*` 主题 token（因此浅色/深色主题与显示字号自动跟随）。客户端只 `require` 三个已被 Web 外壳预置的模块：`react`、`react/jsx-runtime`、`react-dom`；`build.mjs` 会在产物中出现其他 `require` 时直接构建失败。

**4. 时间键必须在两侧算出同一个结果。** `YYYY-MM-DD` / `YYYY-MM-DDTHH` 的构造、解析、区间枚举与切片规则（`grainForRange`）都放在 `src/config.ts` 里，宿主和浏览器端共用同一份实现（该文件不 import 任何东西，因此可以安全地打进浏览器产物）。若各自实现一份，浏览器请求的 `grain` 就可能与宿主实际分桶的方式不一致，表现为表格里全是空的时段。

## 已知限制

- **不显示金额。** 只统计 token，不含定价与人民币/美元换算。
- **与官方后台不会完全一致。** 本插件只统计经过 DSH 的调用；被中断的调用官方仍计费而此处在 harness 未上报用量时记为 0；同一账号下其他 API key 的调用不经过 DSH，因此不计入。
- **本机口径。** 数据来自本机日志与会话记录，不做跨机器汇总。
- **范围上限一年**，由宿主强制；按小时只用于单日范围（宿主另有 31 天的兜底上限）。账本本身保留最近 20 万行。
