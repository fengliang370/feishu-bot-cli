# feishu-bot-cli

飞书开放平台 CLI 工具 —— 一键创建飞书机器人（Webhook 回调模式）。

通过 Puppeteer 捕获浏览器登录凭证，调用飞书开放平台内部 Web API，自动完成从创建应用到发布上线的全流程。

## 功能

- **一键创建机器人**：自动完成 9 步流程（创建应用 → 启用机器人 → 导入权限 → 配置 Webhook → 订阅事件 → 创建版本 → 发布）
- **Webhook 回调模式**：自动配置 HTTP 回调 URL，支持任意 Webhook 地址
- **103 项权限**：内置 27 个 tenant 权限 + 76 个 user 权限，覆盖消息、文档、日历、任务等场景
- **3 个事件订阅**：`im.message.receive_v1`、`im.message.reaction.created_v1`、`im.message.reaction.deleted_v1`
- **双模式登录**：GUI 环境打开浏览器，SSH/容器环境终端二维码扫码

## 前置要求

- Node.js >= 18
- Chrome 或 Edge 浏览器（也可通过 `install-browser` 命令自动下载）

## 快速开始

```bash
# 安装依赖
npm install

# 登录飞书开放平台
npx tsx src/index.ts login

# 一键创建机器人
./run.sh "<webhook_url>" "机器人名称" "机器人描述"
```

> **注意**：URL 包含 `?` 和 `&` 等特殊字符，必须用双引号包裹。

### 示例

```bash
./run.sh "https://example.com/webhook/callback?token=xxx&env=prod" "my-bot" "测试机器人"
```

输出：

```
[1/9] 上传应用图标...
[2/9] 创建应用 "my-bot"...
  App ID: cli_a925xxxxxxxxxx
  https://open.feishu.cn/app/cli_a925xxxxxxxxxx
[3/9] 获取 App Secret...
[4/9] 启用机器人功能...
[5/9] 导入权限列表 (27 tenant + 76 user)...
[6/9] 配置 Webhook 回调...
  ✅ Webhook URL 验证并保存成功
  ✅ 事件模式已切换为 HTTP 回调
[7/9] 添加事件订阅 (receive + reaction.created + reaction.deleted)...
[8/9] 获取用户信息并创建版本 0.0.1...
[9/9] 发送飞书通知...

============================================================
  机器人创建成功！
============================================================
  名称:       my-bot
  App ID:     cli_a925xxxxxxxxxx
  App Secret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  应用链接:   https://open.feishu.cn/app/cli_a925xxxxxxxxxx
============================================================
```

## 命令

### `feishu-bot login`

登录飞书开放平台。

- **有 UI 环境**：自动打开 Chrome/Edge，在浏览器中完成登录
- **无 UI 环境**（SSH、容器、云 IDE）：启动无头浏览器，在终端打印二维码，使用飞书 APP 扫码登录

登录凭证保存到系统 Keychain（macOS）或本地文件 `~/.feishu-bot-cli/credentials.json`。

### `feishu-bot create-bot`

一键创建飞书机器人应用，自动完成以下步骤：

1. 上传应用图标
2. 创建应用 → 获取 App ID / App Secret
3. 启用机器人能力
4. 导入权限（27 tenant + 76 user）
5. 配置 Webhook 回调（获取 verificationToken → check_url 验证 → 切换 eventMode）
6. 订阅事件
7. 创建版本 0.0.1 并提交发布
8. 通过机器人发送飞书通知给创建者

```bash
feishu-bot create-bot --webhook-url "<url>" --name "机器人名称" --desc "描述"
```

| 选项 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| `--webhook-url <url>` | HTTP 回调 URL | 是 | - |
| `-n, --name <name>` | 应用名称 | 否 | `bot` |
| `-d, --desc <desc>` | 应用描述 | 否 | 同 name |

### `feishu-bot apps`

列出当前账号下的所有应用。未登录时自动触发登录流程。

### `feishu-bot install-browser`

下载 Chrome for Testing 到本地缓存（`~/.feishu-bot-cli/browsers/`）。适用于服务器等没有预装浏览器的环境。

### `feishu-bot logout`

清除已保存的登录凭证。

## 环境变量

| 变量 | 说明 |
|------|------|
| `CHROME_PATH` | 指定浏览器可执行文件路径 |
| `LARK_HEADLESS=1` | 强制使用无头模式（终端二维码登录） |
| `LARK_GUI=1` | 强制使用 GUI 模式（打开浏览器窗口） |
| `DEBUG=1` | 输出调试信息（CSRF token、cookies 等） |

## 浏览器查找顺序

1. `CHROME_PATH` 环境变量
2. 系统安装的 Chrome（含 Canary、Chromium）
3. 系统安装的 Edge
4. 通过 `install-browser` 下载的 Chrome

支持 macOS、Linux、Windows 三平台。

## 项目结构

```
src/
  index.ts            # CLI 入口，命令注册
  types.ts            # 类型定义
  browser.ts          # 浏览器登录（GUI + 无头二维码）
  browser-install.ts  # Chrome for Testing 下载管理
  credentials.ts      # 凭证存储（Keychain / 文件）
  api.ts              # 应用列表 API
  create-bot.ts       # 一键创建机器人（9 步流程）
  default-image.ts    # 默认应用图标
run.sh                # 快捷脚本
```

## 开发

```bash
npm install
npx tsx src/index.ts login         # 开发模式运行
npm run build                      # 编译 TypeScript
```

## License

MIT
