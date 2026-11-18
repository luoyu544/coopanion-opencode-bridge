# 发布到 Coopanion 扩展市场

扩展市场的索引（`Pal-AI-Lab/cortico-extensions`）由官方 Action 从 **npm** 同步，不是从 GitHub 仓库自动收录。所以流程是：先发 npm 包，再（可选）提 issue 申请标签/认证。

## 前置

本机目前没有配 git 身份、没有 `gh` CLI、也没有 GitHub/npm token。先准备：

```powershell
git config --global user.name  "你的GitHub用户名"
git config --global user.email "你的邮箱"
# 用 token 方式登录（推荐用环境变量，别写进配置）
$env:GH_TOKEN  = "github_pat_xxx"
$env:NPM_TOKEN = "npm_xxx"
```

把 `package.json` 里的 `repository` / `homepage` / `bugs` 改成你真实的 GitHub 用户名/仓库名（当前是示例 `luoyu/coopanion-opencode-bridge`）。

## 1. 推送到 GitHub

```sh
git remote add origin https://github.com/<你>/coopanion-opencode-bridge.git
git push -u origin main
```

或用 token：`https://<你>:<GH_TOKEN>@github.com/<你>/coopanion-opencode-bridge.git`

## 2. 发布到 npm

```sh
npm login                 # 或 npm config set //registry.npmjs.org/:_authToken=$NPM_TOKEN
npm run build:webui       # 生成 dist/webui.js（已提交也可重跑）
npm publish --access public
```

包名：`cortico-world-opencode-bridge`。发布后到 <https://www.npmjs.com/package/cortico-world-opencode-bridge> 确认。

## 3. 让市场收录

官方 Action 会定时扫描 npm 上带 `cortico-world` 关键字的包并生成 `catalog.json`。上线后等一轮同步（raw 文件有 5 分钟 CDN 缓存），在 Coopanion 扩展页搜索「OpenCode」应该就能看到。

标签/认证需要去索引仓提 issue：<https://github.com/Pal-AI-Lab/cortico-extensions/issues/new>

可直接粘贴：

```text
title: [other] cortico-world-opencode-bridge

body:
package: cortico-world-opencode-bridge
npm: https://www.npmjs.com/package/cortico-world-opencode-bridge
repository: https://github.com/<你>/coopanion-opencode-bridge

请收录到扩展市场。这是一个 Cortico World (kind=world, api=6)，
接收 OpenCode companion 插件的 webhook，让 Coo 在任务完成、需要回答问题或确认权限时主动在气泡里提醒用户。
提供设置页配置表单（端口/令牌/冷却/提醒开关）和运行状态面板。

建议标签：companion, notification
说明：需要同时在 OpenCode 端安装 companion 插件（仓库 opencode-plugin/ 目录），属于 external-setup。
```

> 标签词表和申请格式以索引仓的 `TAGS.md` / `DESIGN.md` 为准；作者不能自己声明官方（official）标签。

## 4. OpenCode 端插件

`opencode-plugin/` 目录里的插件可单独发 npm（`opencode-plugin-coopanion`），或让用户从 GitHub 仓库按 README 用本地路径加载。OpenCode 侧的加载方式见该目录 README。
