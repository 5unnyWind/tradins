# Tradins (Next.js + Vercel)

Tradins 是一个多智能体金融分析工作台，支持流式分析展示、历史记录侧边栏和 Vercel Postgres 持久化。

## 核心能力

- 多智能体流程：市场/基本面/新闻/舆情分析师，并行输出后进入多空辩论、研究主管计划、风控内阁与最终裁定
- 流式输出：分析状态与阶段产物实时更新，市场快照优先展示
- 可视化页面：市场快照、交易计划、四位分析师、辩论轮次、风控结论、底部快速定位 Dock
- 记录管理：侧边栏抽屉展示分析记录，支持分页加载与详情回放
- 存储模式：有 Vercel Postgres 时写库；无数据库环境时本地文件兜底

## API

- `POST /api/analyze`：同步分析接口（非流式）
- `POST /api/analyze/stream`：流式分析接口（SSE）
- `GET /api/records`：获取分析记录列表（支持 `limit`、`cursor`）
- `GET /api/records/:id`：获取单条分析记录
- `GET /api/health`：健康检查

## 本地启动

建议 Node 版本：`22.x`。

1. 安装依赖

```bash
npm install
```

2. 配置环境变量（`.env.local`）

```bash
# LLM
TRADINS_BASE_URL=https://ai.268.pw/v1
TRADINS_API_KEY=your_api_key
TRADINS_MODEL=gpt-5.2
TRADINS_TEMPERATURE=0.2
TRADINS_MAX_TOKENS=1800

# Vercel Postgres（可选）
# POSTGRES_URL=...
# POSTGRES_PRISMA_URL=...
```

3. 启动开发环境

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。

## 部署到 Vercel

1. 在 Vercel 创建项目并导入仓库
2. 在 Vercel 控制台添加 Postgres（Storage -> Postgres）
3. 配置环境变量：`TRADINS_BASE_URL`、`TRADINS_API_KEY`、`TRADINS_MODEL`，以及 Postgres 自动注入变量（`POSTGRES_URL` 等）
4. 触发部署

部署后会自动使用 `analysis_records` 表（首次写入时自动建表）。

## 目录结构

- `app/`：页面与 API routes
- `components/`：前端组件
- `lib/`：分析引擎、数据采集、LLM、数据库
