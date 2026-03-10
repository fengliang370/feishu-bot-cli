#!/usr/bin/env node

import { Command } from "commander";
import { loginAndCapture } from "./browser.js";
import {
  saveCredentials,
  loadCredentials,
  clearCredentials,
  getStorageType,
} from "./credentials.js";
import { fetchAllApps } from "./api.js";
import { createBot } from "./create-bot.js";
import { downloadChrome, getInstalledChromePath } from "./browser-install.js";
import type { Credentials, AppInfo } from "./types.js";

const program = new Command();

program
  .name("feishu-bot")
  .description("飞书开放平台 CLI 工具 —— 一键创建飞书机器人")
  .version("0.1.0");

// ==================== 辅助函数 ====================

/** 确保已登录，未登录则自动触发登录流程 */
async function ensureCredentials(opts: {
  timeout?: string;
  browserArgs?: string;
}): Promise<Credentials> {
  let creds = await loadCredentials();

  if (!creds) {
    console.log("未找到登录信息，请先登录...\n");
    const extraArgs = opts.browserArgs
      ?.split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    creds = await loginAndCapture(Number(opts.timeout || "120") * 1000, extraArgs);
    await saveCredentials(creds);
  }

  return creds;
}

function getStatusText(status: number): string {
  switch (status) {
    case 0:
      return "未发布";
    case 2:
      return "已发布";
    default:
      return `未知(${status})`;
  }
}

function printApps(apps: AppInfo[]): void {
  if (apps.length === 0) {
    console.log("没有找到应用");
    return;
  }

  console.log(`\n共找到 ${apps.length} 个应用:\n`);
  console.log("─".repeat(80));

  for (const app of apps) {
    const status = getStatusText(app.appStatus);
    console.log(`  App ID:   ${app.appID}`);
    console.log(`  名称:     ${app.name}`);
    if (app.desc) {
      console.log(`  描述:     ${app.desc}`);
    }
    if (app.version) {
      console.log(`  版本:     ${app.version}`);
    }
    console.log(`  状态:     ${status}`);
    if (app.ability.length > 0) {
      console.log(`  能力:     ${app.ability.join(", ")}`);
    }
    console.log("─".repeat(80));
  }
}

// ==================== 命令注册 ====================

// login
program
  .command("login")
  .description("登录飞书开放平台（打开 Chrome 浏览器）")
  .option("-t, --timeout <seconds>", "登录超时时间（秒）", "120")
  .option("--browser-args <args>", "额外的浏览器启动参数（逗号分隔）")
  .action(async (opts) => {
    try {
      const extraArgs = opts.browserArgs
        ?.split(",")
        .map((a: string) => a.trim())
        .filter(Boolean);
      const creds = await loginAndCapture(Number(opts.timeout) * 1000, extraArgs);
      await saveCredentials(creds);
      console.log(
        `\n登录信息已保存至${getStorageType()}，可以使用 feishu-bot apps 查看应用列表`
      );
    } catch (err) {
      console.error("登录失败:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// apps
program
  .command("apps")
  .description("列出所有应用")
  .option("-t, --timeout <seconds>", "登录超时时间（秒）", "120")
  .option("--browser-args <args>", "额外的浏览器启动参数（逗号分隔）")
  .action(async (opts) => {
    try {
      const creds = await ensureCredentials(opts);
      const apps = await fetchAllApps(creds);
      printApps(apps);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n获取应用列表失败: ${msg}`);
      console.error("请尝试重新登录: feishu-bot login");
      process.exit(1);
    }
  });

// create-bot
program
  .command("create-bot")
  .description("一键创建飞书机器人应用（Webhook 回调模式）")
  .requiredOption("--webhook-url <url>", "HTTP 回调 URL（Webhook）")
  .option("-n, --name <name>", "应用名称", "bot")
  .option("-d, --desc <desc>", "应用描述")
  .option("-t, --timeout <seconds>", "登录超时时间（秒）", "120")
  .option("--browser-args <args>", "额外的浏览器启动参数（逗号分隔）")
  .action(async (opts) => {
    try {
      const creds = await ensureCredentials(opts);
      const name = opts.name as string;
      const desc = (opts.desc as string) || name;
      const webhookUrl = opts.webhookUrl as string;
      const result = await createBot(creds, { name, desc, webhookUrl });

      console.log("\n" + "=".repeat(60));
      console.log("  机器人创建成功！");
      console.log("=".repeat(60));
      console.log(`  名称:       ${result.name}`);
      console.log(`  描述:       ${result.desc}`);
      console.log(`  App ID:     ${result.appId}`);
      console.log(`  App Secret: ${result.appSecret}`);
      console.log(`  应用链接:   https://open.feishu.cn/app/${result.appId}`);
      console.log(
        `  版本链接:   https://open.feishu.cn/app/${result.appId}/version/${result.versionId}`
      );
      console.log("=".repeat(60));
      process.exit(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n创建机器人失败: ${msg}`);
      process.exit(1);
    }
  });

// install-browser
program
  .command("install-browser")
  .description("下载 Chrome 浏览器（适用于服务器等无浏览器环境）")
  .action(async () => {
    const existing = await getInstalledChromePath();
    if (existing) {
      console.log(`Chrome 已存在: ${existing}`);
      return;
    }

    try {
      const execPath = await downloadChrome();
      console.log(`\nChrome 已就绪: ${execPath}`);
    } catch (err) {
      console.error("下载失败:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// logout
program
  .command("logout")
  .description("清除已保存的登录信息")
  .action(async () => {
    await clearCredentials();
    console.log("登录信息已清除");
  });

program.parse();
