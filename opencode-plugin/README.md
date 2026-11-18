# OpenCode companion 插件

监听 OpenCode 事件，在任务完成 / 需要回答问题 / 需要确认权限时，把提醒 POST 给 Coopanion 的「OpenCode 提醒桥」World，让桌宠 Coo 在气泡里主动提醒你。

## 安装

### 全局（所有项目）

复制本目录到 `~/.config/opencode/plugins/companion/`（Windows：`C:\Users\<你>\.config\opencode\plugins\companion\`）。OpenCode 会自动发现，无需写配置。

### 只给某个项目

复制本目录到项目的 `.opencode/plugins/companion/`。

### 带参数

在 `opencode.jsonc` 里加载（先把目录放到不会自动发现的位置，比如 `./plugins/companion`）：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "./plugins/companion",
      "options": {
        "webhook": "http://127.0.0.1:17321/notify",
        "headers": { "x-opencode-token": "你的令牌" },
        "events": {
          "taskComplete": true,
          "question": true,
          "permission": true,
          "error": false
        },
        "quietMs": 6000,
        "cooldownMs": 1500
      }
    }
  ]
}
```

## 配置项

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `webhook` | `http://127.0.0.1:17321/notify` | 接收地址，可传数组广播 |
| `headers` | `{}` | 附加请求头（配合扩展里的令牌） |
| `file` | 关闭 | 同时写 JSONL 文件 |
| `events.*` | 见上 | 各类提醒开关 |
| `debounceMs` | `450` | `session.idle` 后等待问答/权限事件的时间 |
| `quietMs` | `6000` | 没有 `session.idle` 时，最后活动后静默多久算任务结束 |
| `cooldownMs` | `1500` | 同类提醒最小间隔 |
| `sessionTitle` | `true` | 消息里带会话标题 |
| `log` | `true` | 控制台打印 |
| `timeoutMs` | `3000` | webhook 超时 |

## 事件

- 任务完成：`session.idle`，或「最后活动后静默 `quietMs` 毫秒」
- 回答问题：`form.created`（OpenCode 的 `question` 工具），带问题和选项
- 确认权限：`permission.asked`（`question` 工具自身的权限会跳过，避免重复）
- 任务失败：`session.execution.failed`（默认关闭）

同一轮只报一次；如果会话正在等你回答/确认，不会误报「任务完成」。
