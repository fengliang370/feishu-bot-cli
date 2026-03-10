import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createRequire } from "module";
import type { Credentials } from "./types.js";

const SERVICE_NAME = "com.feishu.bot-cli";
const ACCOUNT_NAME = "credentials";
const CONFIG_DIR = path.join(os.homedir(), ".feishu-bot-cli");
const CREDENTIALS_FILE = path.join(CONFIG_DIR, "credentials.json");

// keytar 是 native 模块，需要 require 加载
let keytar: typeof import("keytar") | null = null;
let useFileStorage = false;

try {
  const require = createRequire(import.meta.url);
  keytar = require("keytar");
} catch {
  useFileStorage = true;
}

// ==================== 文件存储（降级方案）====================

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function readFileStore(): Record<string, string> {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));
    }
  } catch {
    // corrupted file, ignore
  }
  return {};
}

function writeFileStore(data: Record<string, string>): void {
  ensureConfigDir();
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

// ==================== 对外 API ====================

const STORE_KEY = `${SERVICE_NAME}:${ACCOUNT_NAME}`;

/** 保存凭证到 Keychain 或文件 */
export async function saveCredentials(creds: Credentials): Promise<void> {
  const value = JSON.stringify(creds);

  if (!useFileStorage && keytar) {
    try {
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, value);
      return;
    } catch {
      useFileStorage = true;
    }
  }

  const store = readFileStore();
  store[STORE_KEY] = value;
  writeFileStore(store);
}

/** 加载已保存的凭证，不存在时返回 null */
export async function loadCredentials(): Promise<Credentials | null> {
  let raw: string | null = null;

  if (!useFileStorage && keytar) {
    try {
      raw = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    } catch {
      useFileStorage = true;
    }
  }

  if (!raw) {
    const store = readFileStore();
    raw = store[STORE_KEY] || null;
  }

  if (!raw) return null;

  try {
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

/** 清除已保存的凭证 */
export async function clearCredentials(): Promise<void> {
  if (!useFileStorage && keytar) {
    try {
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
      return;
    } catch {
      useFileStorage = true;
    }
  }

  const store = readFileStore();
  if (STORE_KEY in store) {
    delete store[STORE_KEY];
    writeFileStore(store);
  }
}

/** 返回当前使用的存储方式名称 */
export function getStorageType(): string {
  return useFileStorage ? "文件" : "Keychain";
}
