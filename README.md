# OpenCode 提醒桥（Coopanion / Cortico World）

让桌宠 **Coo** 在你用 OpenCode 时主动提醒你：

| 场景 | 提醒 |
| --- | --- |
| 任务完成 | ✅ 任务完成，回去看看结果 |
| 需要你回答问题 | ❓ 带上问题标题、描述和选项 |
| 需要确认权限 | 🔐 带上操作和路径 |
| 任务失败 | ⚠️ 可选，默认关闭 |

本仓库包含两部分：

- **`cortico-world-opencode-bridge`**（本目录，npm 包）：Coopanion 端的 World 扩展，提供 webhook 接收端和配置界面。
- **[`opencode-plugin/`](./opencode-plugin)**：OpenCode 端的 companion 插件，监听 OpenCode 事件并发 webhook。两边都要装。

## 安装

### 从扩展市场（发布后）

在 Coopanion 设置 → **World 扩展** → 搜索「OpenCode」，安装后在列表里**启用**它。

### 本地开发安装

把整个目录复制到扩展目录并重启 Coopanion：

```sh
# Windows 默认扩展目录
C:\Users\<你>\AppData\Local\Programs\Coopanion\data\extensions\node_modules\
```

或在 Coopanion 扩展页选择「从本地目录安装」，指向本目录。

## 配置界面

在设置窗口选中这个 World，会看到两块：

- **配置**（自动表单，和其他扩展一样）
  - Webhook 端口（默认 `17321`）
  - 访问令牌（可选；设置后插件需带 `x-opencode-token`）
  - 提醒冷却（默认 `1200` 毫秒）
  - 四类提醒开关 + 是否打印日志
  - World 的启用/停用在 World 列表里，和其他扩展一致
- **运行状态**面板
  - 接收端是否在听、收到/推送条数、最近一次提醒
  - 「发送测试提醒」按钮：点一下 Coo 应该立刻说话
  - 「重启接收端」：改完端口/令牌后点它生效

> 端口和令牌改完要点「重启接收端」；冷却和开关是热更新，改完立刻生效。

## OpenCode 端

见 [`opencode-plugin/README.md`](./opencode-plugin/README.md)。默认已经指向 `http://127.0.0.1:17321/notify`，和这里的默认端口一致。如果改了端口或设了令牌，OpenCode 插件的 `webhook` / `headers` 要同步改。

提醒数据格式（POST JSON）：

```json
{
  "kind": "question",
  "title": "❓ 需要你回答问题",
  "message": "选择部署目标\n• 环境 — 生产 / 预发",
  "sessionID": "ses_xxx",
  "sessionTitle": "修复登录问题",
  "timestamp": 1760000000
}
```

## 开发

```sh
bun install          # 或 pnpm install
bun run build:webui  # 重新生成 dist/webui.js
```

`dist/webui.js` 已提交，普通用户不需要构建。

## 发布到 npm / 扩展市场

见 [MARKETPLACE.md](./MARKETPLACE.md)。

## License

MIT
