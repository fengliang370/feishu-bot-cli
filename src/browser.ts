import puppeteer, { type Page, type Browser as PuppeteerBrowser } from "puppeteer-core";
import { existsSync } from "fs";
import { createRequire } from "module";
import { PNG } from "pngjs";
import QRCode from "qrcode";
import { getInstalledChromePath } from "./browser-install.js";
import type { Credentials } from "./types.js";

const require = createRequire(import.meta.url);
const jsQR = require("jsqr") as { default: typeof import("jsqr").default } | (typeof import("jsqr"));

// ==================== 常量 ====================

const LOGIN_URL =
  "https://accounts.feishu.cn/accounts/page/login?app_id=7&no_trap=1&redirect_uri=https%3A%2F%2Fopen.feishu.cn%2F";
const APP_PAGE_URL = "https://open.feishu.cn/app";
const APP_LIST_API_PATH = "/developers/v1/app/list";
const DEFAULT_LOGIN_TIMEOUT = 2 * 60 * 1000;
const QR_REFRESH_INTERVAL = 60_000;

const DEFAULT_BROWSER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--no-first-run",
  "--no-default-browser-check",
];

// ==================== 浏览器查找 ====================

function getBrowserArgs(extraArgs?: string[]): string[] {
  const args = [...DEFAULT_BROWSER_ARGS];

  const envArgs = process.env["LARK_BROWSER_ARGS"];
  if (envArgs) {
    args.push(...envArgs.split(",").map((a) => a.trim()).filter(Boolean));
  }

  if (extraArgs?.length) {
    args.push(...extraArgs);
  }

  return [...new Set(args)];
}

async function findBrowser(): Promise<string> {
  // 优先使用环境变量
  const envPath = process.env["CHROME_PATH"];
  if (envPath && existsSync(envPath)) return envPath;

  const candidates = [
    // macOS - Chrome
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    // macOS - Edge
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    // Linux - Chrome
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    // Linux - Edge
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
    // Windows - Chrome
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    // Windows - Edge
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  // 回退到通过 install-browser 下载的 Chrome
  const installed = await getInstalledChromePath();
  if (installed) return installed;

  throw new Error(
    "未找到浏览器，请运行 feishu-bot install-browser 下载，或设置 CHROME_PATH 环境变量"
  );
}

// ==================== 环境检测 ====================

/** 是否使用 GUI 模式（仅当用户显式指定 LARK_GUI=1 时） */
function shouldUseGUI(): boolean {
  return process.env["LARK_GUI"] === "1";
}

// ==================== 二维码相关 ====================

/** 从页面提取二维码数据（canvas.toDataURL → 元素截图 → 全页截图） */
async function captureQRCode(page: Page): Promise<string | null> {
  const decode = typeof jsQR === "function" ? jsQR : (jsQR as { default: Function }).default;

  // 方法1: 通过 canvas.toDataURL() 直接获取二维码图像数据
  const canvasSelectors = [
    '.newLogin_scan-QR-code canvas',
    '.new-scan-qrcode-container canvas',
    '[class*="qr"] canvas',
    'canvas',
  ];

  for (const selector of canvasSelectors) {
    try {
      const dataUrl = await page.evaluate((sel) => {
        const canvas = document.querySelector(sel) as HTMLCanvasElement | null;
        if (!canvas || canvas.width < 50) return null;
        return canvas.toDataURL('image/png');
      }, selector);

      if (dataUrl) {
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        const pngBuf = Buffer.from(base64, 'base64');
        const png = PNG.sync.read(pngBuf);
        const code = decode(new Uint8ClampedArray(png.data), png.width, png.height);
        if (code?.data) {
          if (process.env["DEBUG"]) {
            console.error(`[DEBUG] QR found via canvas.toDataURL: ${selector}`);
          }
          return code.data;
        }
      }
    } catch {
      // 继续尝试下一个选择器
    }
  }

  // 方法2: 元素级截图（适用于 img 元素）
  const imgSelectors = [
    '.newLogin_scan-QR-code img',
    '[class*="qrcode"] img',
    '[class*="qr-code"] img',
    'img[class*="qrcode"]',
  ];

  for (const selector of imgSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const shot = Buffer.from((await el.screenshot()) as Uint8Array);
        const png = PNG.sync.read(shot);
        const code = decode(new Uint8ClampedArray(png.data), png.width, png.height);
        if (code?.data) {
          if (process.env["DEBUG"]) {
            console.error(`[DEBUG] QR found via element screenshot: ${selector}`);
          }
          return code.data;
        }
      }
    } catch {
      // 继续尝试
    }
  }

  // 方法3: 全页截图后解码（回退方案）
  try {
    const screenshot = Buffer.from((await page.screenshot()) as Uint8Array);
    const png = PNG.sync.read(screenshot);
    const code = decode(new Uint8ClampedArray(png.data), png.width, png.height);
    if (code?.data) {
      if (process.env["DEBUG"]) {
        console.error("[DEBUG] QR found via full page screenshot");
      }
      return code.data;
    }
  } catch (err) {
    if (process.env["DEBUG"]) {
      console.error(`[DEBUG] Full page QR extraction failed: ${err}`);
    }
  }

  return null;
}

/** 在终端打印二维码 */
async function printQRToTerminal(data: string): Promise<void> {
  const text = await QRCode.toString(data, { type: "terminal", small: true });
  console.log(text);
}

/** 尝试切换到二维码扫码登录模式 */
async function tryActivateQRLogin(page: Page): Promise<void> {
  const selectors = [
    "::-p-text(扫码登录)",
    "::-p-text(二维码登录)",
    '[class*="qrcode-switch"]',
    '[class*="qr-switch"]',
    '[class*="scan-switch"]',
    '[data-testid="qrcode-login"]',
  ];

  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await el.click();
        await new Promise((r) => setTimeout(r, 2000));
        return;
      }
    } catch {
      // 继续尝试下一个选择器
    }
  }
}

// ==================== 登录等待 ====================

/** 等待用户在浏览器中完成登录（检测 session cookie） */
async function waitForLogin(page: Page, timeout: number): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const url = page.url();
    if (url.includes("open.feishu.cn")) {
      const cookies = await page.cookies("https://open.feishu.cn");
      if (cookies.some((c) => c.name === "session")) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`登录超时（${Math.round(timeout / 1000)}秒），请重试`);
}

// ==================== 凭证获取 ====================

/** 登录完成后获取凭证（cookies + CSRF token） */
async function captureCredentials(page: Page): Promise<Credentials> {
  // 监听 API 请求，同时捕获 x-csrf-token header 和请求中的完整 cookie
  // 飞书的 lark_oapi_csrf_token cookie 设置了特定 path，page.cookies() 拿不到
  // 但浏览器发请求时会带上，所以从拦截的请求中提取
  let csrfResolved = false;
  let capturedRequestCookie = "";

  const csrfPromise = new Promise<string>((resolve) => {
    const handler = (response: { request(): { method(): string; url(): string; headers(): Record<string, string> } }) => {
      const request = response.request();
      if (request.method() === "POST" && request.url().includes(APP_LIST_API_PATH)) {
        const token = request.headers()["x-csrf-token"] || "";
        capturedRequestCookie = request.headers()["cookie"] || "";

        if (process.env["DEBUG"]) {
          const csrfParts = capturedRequestCookie.split("; ").filter((c) => c.includes("csrf"));
          console.error(`[DEBUG] Intercepted app/list — x-csrf-token: ${token.substring(0, 30)}...`);
          console.error(`[DEBUG] CSRF cookies in request: ${csrfParts.join(", ") || "NONE"}`);
        }

        csrfResolved = true;
        page.off("response", handler);
        resolve(token);
      }
    };

    page.on("response", handler);

    // 超时回退
    setTimeout(() => {
      if (!csrfResolved) {
        csrfResolved = true;
        page.off("response", handler);
        resolve("__fallback__");
      }
    }, 15000);
  });

  // 导航到应用列表页，触发 API 请求
  await page.goto(APP_PAGE_URL, { waitUntil: "networkidle2" });
  let csrfToken = await csrfPromise;

  // fallback：尝试从页面 JS 中读取
  if (csrfToken === "__fallback__") {
    csrfToken = await page.evaluate(() => {
      const m = document.cookie.match(/lark_oapi_csrf_token=([^;]+)/);
      return m ? m[1] : "";
    });
  }

  // 获取 puppeteer 能拿到的 cookies（这些是 path=/ 的通用 cookie）
  const cookies = await page.cookies("https://open.feishu.cn");
  let cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  // 关键：从拦截的请求中合并 puppeteer 捕获不到的 cookie（特定 path 的）
  if (capturedRequestCookie) {
    const puppeteerNames = new Set(cookies.map((c) => c.name));
    const extraCookies = capturedRequestCookie
      .split("; ")
      .filter((c) => {
        const name = c.split("=")[0];
        return !puppeteerNames.has(name);
      });
    if (extraCookies.length > 0) {
      cookieString += "; " + extraCookies.join("; ");
      if (process.env["DEBUG"]) {
        console.error(`[DEBUG] Merged ${extraCookies.length} extra cookies from request: ${extraCookies.map(c => c.split("=")[0]).join(", ")}`);
      }
    }
  }

  // 最后保底：如果合并后仍然没有 lark_oapi_csrf_token，手动添加
  if (csrfToken && !cookieString.includes("lark_oapi_csrf_token=")) {
    cookieString += `; lark_oapi_csrf_token=${csrfToken}`;
  }

  if (process.env["DEBUG"]) {
    console.error(`[DEBUG] CSRF Token: ${csrfToken}`);
    console.error(`[DEBUG] Cookie names: ${cookies.map((c) => `${c.name}(domain=${c.domain},path=${c.path})`).join(", ")}`);
    console.error(`[DEBUG] Full cookie string length: ${cookieString.length}`);
    console.error(`[DEBUG] Has lark_oapi_csrf_token: ${cookieString.includes("lark_oapi_csrf_token")}`);
    console.error(`[DEBUG] swp_csrf_token: ${cookies.find((c) => c.name === "swp_csrf_token")?.value || "NOT FOUND"}`);
  }

  console.log("凭证获取成功！");
  return { cookieString, csrfToken, savedAt: Date.now() };
}

// ==================== 登录入口 ====================

/** 终端二维码扫码登录（默认模式，无需 GUI） */
async function loginHeadlessWithQR(
  timeout: number,
  extraBrowserArgs?: string[]
): Promise<Credentials> {
  const chromePath = process.env["CHROME_PATH"] || (await findBrowser());

  console.log("正在启动无头浏览器...");
  console.log("请使用飞书 APP 扫描终端中的二维码完成登录\n");
  const browser: PuppeteerBrowser = await puppeteer.launch({
    headless: true,
    executablePath: chromePath,
    args: getBrowserArgs(extraBrowserArgs),
    defaultViewport: { width: 1280, height: 800 },
  });

  try {
    const page = await browser.newPage();
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });

    // 等待页面渲染完成
    await new Promise((r) => setTimeout(r, 2000));

    // 尝试截取二维码
    let qrData = await captureQRCode(page);
    if (!qrData) {
      await tryActivateQRLogin(page);
      await new Promise((r) => setTimeout(r, 2000));
      qrData = await captureQRCode(page);
    }

    if (!qrData) {
      throw new Error(
        "无法从登录页面提取二维码。请尝试设置 LARK_GUI=1 强制使用 GUI 模式登录。"
      );
    }

    console.log("请使用飞书 APP 扫描以下二维码登录：\n");
    await printQRToTerminal(qrData);
    console.log("等待扫码...\n");

    // 等待登录，同时监测二维码刷新
    const startTime = Date.now();
    let lastQR = qrData;
    let lastQRCheck = Date.now();

    while (Date.now() - startTime < timeout) {
      // 检测是否已登录
      const url = page.url();
      if (url.includes("open.feishu.cn")) {
        const cookies = await page.cookies("https://open.feishu.cn");
        if (cookies.some((c) => c.name === "session")) {
          break;
        }
      }

      // 仍在登录页时定期检查二维码是否刷新
      if (
        url.includes("accounts.feishu.cn") &&
        Date.now() - lastQRCheck > QR_REFRESH_INTERVAL
      ) {
        lastQRCheck = Date.now();
        try {
          const newQR = await captureQRCode(page);
          if (newQR && newQR !== lastQR) {
            lastQR = newQR;
            console.log("\n二维码已刷新，请重新扫描：\n");
            await printQRToTerminal(newQR);
            console.log("等待扫码...\n");
          } else if (!newQR) {
            // 二维码可能已过期，刷新页面
            console.log("\n二维码可能已过期，正在刷新...\n");
            await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });
            await new Promise((r) => setTimeout(r, 2000));
            const refreshedQR = await captureQRCode(page);
            if (refreshedQR) {
              lastQR = refreshedQR;
              console.log("请使用飞书 APP 扫描以下新二维码：\n");
              await printQRToTerminal(refreshedQR);
              console.log("等待扫码...\n");
            }
          }
        } catch {
          // 忽略二维码刷新错误
        }
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    if (Date.now() - startTime >= timeout) {
      throw new Error(`登录超时（${Math.round(timeout / 1000)}秒），请重试`);
    }

    console.log("\n登录成功！正在获取凭证...");
    return await captureCredentials(page);
  } finally {
    await browser.close();
  }
}

/** GUI 环境：打开 Chrome 浏览器让用户登录 */
async function loginWithBrowser(
  timeout: number,
  extraBrowserArgs?: string[]
): Promise<Credentials> {
  const chromePath = process.env["CHROME_PATH"] || (await findBrowser());

  console.log("正在启动 Chrome...");
  console.log("请在浏览器中完成飞书登录，登录成功后会自动获取凭证\n");

  const browser: PuppeteerBrowser = await puppeteer.launch({
    headless: false,
    executablePath: chromePath,
    args: getBrowserArgs(extraBrowserArgs),
    defaultViewport: { width: 1280, height: 800 },
  });

  try {
    const page = await browser.newPage();
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });

    console.log("等待登录完成...");
    await waitForLogin(page, timeout);

    console.log("\n登录成功！正在获取凭证...");
    return await captureCredentials(page);
  } finally {
    await browser.close();
  }
}

/**
 * 启动浏览器让用户登录，并捕获凭证（cookies + CSRF token）
 * 默认使用终端二维码模式（headless），设置 LARK_GUI=1 或传入 --gui 切换为 GUI 浏览器
 */
export async function loginAndCapture(
  timeoutMs: number = DEFAULT_LOGIN_TIMEOUT,
  extraBrowserArgs?: string[]
): Promise<Credentials> {
  if (shouldUseGUI()) {
    return loginWithBrowser(timeoutMs, extraBrowserArgs);
  }
  return loginHeadlessWithQR(timeoutMs, extraBrowserArgs);
}
