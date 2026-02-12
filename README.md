# tradins (Next.js + Vercel)

`tradins` 已重构为 **Next.js 全栈项目**，可直接部署到 Vercel，并把分析记录持久化到 Vercel Postgres。

## 核心能力

- 多智能体投研流程：
  - Market Analyst（技术面）
  - Fundamentals Analyst（基本面）
  - News Analyst（消息面）
  - Social Analyst（舆情）
  - Bull/Bear 多轮辩论
  - Research Manager 初步交易计划
  - Risky/Safe/Neutral 风控内阁 + Risk Judge 最终裁定
- 可视化面板：
  - 参数输入、价格图、数据流图、四分析师卡片、辩论时间线、风控结论
- API：
  - `POST /api/analyze`
  - `GET /api/records`
  - `GET /api/records/:id`
  - `GET /api/health`
- 记录持久化：
  - 有 Vercel Postgres 环境变量时写入数据库
  - 无数据库环境时回退内存存储（本地开发兜底）

## 本地启动

建议 Node 版本：`22.x`（已在本项目验证）。

1. 安装依赖

```bash
npm install
```

2. 配置环境变量（`.env.local`）

```bash
# LLM（可被 TRADINS_* 覆盖）
TRADINS_BASE_URL=https://ai.268.pw/v1
TRADINS_API_KEY=your_api_key
TRADINS_MODEL=gpt-5.2
TRADINS_TEMPERATURE=0.2
TRADINS_MAX_TOKENS=1800

# Vercel Postgres（可选，本地可不填）
# POSTGRES_URL=...
# POSTGRES_PRISMA_URL=...
```

3. 运行

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)

## 部署到 Vercel

1. 在 Vercel 创建项目并导入本仓库  
2. 在 Vercel 控制台给项目添加 **Postgres**（Storage -> Postgres）  
3. 在项目 Environment Variables 配置：
   - `TRADINS_BASE_URL`
   - `TRADINS_API_KEY`
   - `TRADINS_MODEL`
   - 以及 Postgres 自动注入变量（`POSTGRES_URL` 等）
4. 触发部署

部署后，分析记录会自动写入 `analysis_records` 表（服务首次写入时自动建表）。

## 目录说明

- `app/`: Next.js App Router 页面与 API routes
- `components/`: 可视化组件
- `lib/`: 分析引擎、数据采集、LLM、数据库
