# 知衡智企

知衡智企是一套面向企业本地部署的 AI 工作平台，帮助企业把账号、员工、权限、知识资产和真实业务工作空间统一沉淀到一套系统中。

当前系统聚焦企业内部管理和 AI 工作台底座，已经包含本地账号认证、员工管理、RBAC 权限、Workspace 工作空间体系，以及短视频生产工作空间的基础模块。

## 产品定位

知衡智企服务于单一企业内部使用，不把企业等同为工作空间。工作空间代表企业内部的一类真实业务场景，例如短视频生产、销售工作、客服工作、企业知识管理和生产问题处理。

每个工作空间可以承载独立的工具、流程、成员和权限，使企业能够按业务区域组织 AI 能力和协作流程。

## 当前能力

- 本地账号登录与会话管理
- 员工管理、头像上传、账号启停、软删除和密码重置
- 公司级 RBAC 角色控制
- Workspace 工作空间中心
- Workspace 成员与权限管理
- 短视频生产工作空间
- 个人资料与首次登录改密流程
- SQLite + Drizzle 本地数据模型与迁移

## 短视频生产工作空间

当前短视频生产工作空间包含以下模块骨架：

- 概览
- 素材库
- 选题
- 脚本
- AI 视频
- 项目
- 审核
- 发布
- 复盘
- 成员

这些模块为后续接入素材管理、AI 视频生成、审核发布和数据复盘提供结构基础。

## 技术栈

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Drizzle ORM
- SQLite
- TanStack Query

## 本地开发

安装依赖：

```bash
npm install
```

复制环境变量示例并按本地环境调整：

```bash
copy env.example.txt .env.local
```

执行数据库迁移：

```bash
npm run db:migrate
```

初始化管理员账号：

```bash
npm run init-admin
```

启动开发服务：

```bash
npm run dev
```

默认访问地址：

```text
http://localhost:3000
```

## 常用脚本

```bash
npm run dev
npm run typecheck
npm run build
npm run db:migrate
npm run init-admin
npm run seed:workspaces
```

## 部署说明

当前项目支持企业本地部署模式。生产环境应配置持久化数据库路径，并根据实际服务器环境设置 `.env.local` 或等效环境变量。

部署前至少执行：

```bash
npm run typecheck
npm run build
npm run db:migrate
```

## 许可证

本项目基于开源模板演进而来。许可证与上游开源声明请见 `LICENSE`，后续商业交付版本可按企业内部要求补充 NOTICE 或版权说明。
