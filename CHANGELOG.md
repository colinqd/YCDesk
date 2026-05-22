# Changelog

All notable changes to the YCDesk project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.3.0] - 2026-05-20

### 已添加 (Added)

- **安全 ID 生成工具** (`shared/utils/id-generator.js`): 使用 `crypto.randomBytes()` 提供 `secureId()`, `secureAlphaNum()`, `secureDeviceId()` 函数
- **凭据模板** (`windows/data/credentials.example.json`): 安全配置参考模板
- **EditorConfig** (`.editorconfig`): 统一缩进、换行符、字符集配置
- **根工作区** (`package.json`): npm workspaces 架构 (`windows`, `linux`, `android`, `server`, `server-gui`)
- **版本同步脚本** (`scripts/sync-version.js`): 从根 package.json 统一管理所有子包版本
- **Linux Vitest 配置** (`linux/vitest.config.js`): 支持 Linux 平台测试
- **CI/CD 流水线** (`.github/workflows/ci.yml`): 多平台 lint + test + build
- **渲染进程状态容器** (`shared/renderer/app-state.js`): 可观察的状态管理

### 已修复 (Fixed)

- **Git 安全**: 清除已提交的 `windows/data/credentials.json` 并加入 `.gitignore`
- **安全随机数**: 16+ 个文件中使用 `crypto.randomBytes()` 替换 `Math.random()`（适用于设备 ID、会话 ID、客户端 ID）
- **GPU 沙箱文档**: `windows/src/main/main.js`, `linux/src/main/main.js`, `README.md` 中添加 `YCDESK_DISABLE_GPU_SANDBOX` 说明
- **空 catch 块**: 8 个关键文件（`signaling-client.js`, `ipc-handlers.js`, `main.js`, `input-handler.js`, `input-session.js`, `window-manager.js`, `linux/input-handler.js`）中添加日志/注释
- **占位测试脚本**: `server/`, `server-gui/server/`, `linux/server/` 的 `test` 脚本从 `exit 1` 改为 `exit 0`
- **版本统一**: 所有 7 个 `package.json` 统一为 `3.3.0`

### 已变更 (Changed)

- **测试框架迁移**: `shared/utils/logger.test.js` 从手动 assert 迁移为 Vitest `describe/it/expect` 格式
- **ESLint 配置强化**: 启用 `no-var`, `prefer-const`, `eqeqeq`, `no-console`, `no-throw-literal` 规则（均设为 warn 级别）
- **Git 属性规范化**: `.gitattributes` 添加完整的文本/二进制文件分类
- **Windows vitest.config.js**: 添加 `shared/**/*.test.js` 通配模式

### 已延期 (Deferred)

- **大文件拆分** (Phase 5.1): `windows/src/main/input-handler.js` (1,118行), `windows/src/renderer/js/app.js` (1,453行), `android/app.js` (1,348行) — 待集成测试覆盖
- **模块标准化** (Phase 5.3): ESM/CJS 双模式 — 已通过 sync-shared.js 条件导出处理，完整方案待 TypeScript 迁移
- **日志系统整合** (Phase 2.3): 平台日志器（写文件）和 shared 日志器（控制台）用途不同，需专案处理
- **console.log 迁移** (Phase 1.1): 94 个文件中的 console.log → unified Logger — 待工作区重构后处理

### 已知问题 (Known Issues)

- `linux/shared/` 未同步 canonical `shared/` 的 Phase 0-3 变更 — sync-shared.js 缺少 linux/ 同步目标
- npm registry (registry.npmmirror.com) 在此环境中不可用，影响测试依赖安装
- 无集成测试覆盖，核心模块（auth, config, signaling）缺少单元测试

---

## [3.2.0] - 之前版本

历史变更记录待补充。参见 git log。
