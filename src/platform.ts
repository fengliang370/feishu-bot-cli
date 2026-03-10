/** 平台类型：飞书（中国）/ Lark（海外） */
export type Platform = "feishu" | "lark";

const DOMAINS: Record<Platform, { accounts: string; open: string; passport: string }> = {
  feishu: {
    accounts: "accounts.feishu.cn",
    open: "open.feishu.cn",
    passport: "passport.feishu.cn",
  },
  lark: {
    accounts: "accounts.larksuite.com",
    open: "open.larksuite.com",
    passport: "passport.larksuite.com",
  },
};

let _platform: Platform = "feishu";

export function setPlatform(p: Platform): void {
  _platform = p;
}

export function getPlatform(): Platform {
  return _platform;
}

/** https://open.feishu.cn 或 https://open.larksuite.com */
export function openBaseUrl(): string {
  return `https://${DOMAINS[_platform].open}`;
}

/** https://accounts.feishu.cn 或 https://accounts.larksuite.com */
export function accountsHost(): string {
  return DOMAINS[_platform].accounts;
}

/** https://passport.feishu.cn 或 https://passport.larksuite.com */
export function passportBaseUrl(): string {
  return `https://${DOMAINS[_platform].passport}`;
}

/** 开放平台 API 前缀 */
export function apiBase(): string {
  return `${openBaseUrl()}/developers/v1`;
}

/** 登录页 URL */
export function loginUrl(): string {
  return `https://${DOMAINS[_platform].accounts}/accounts/page/login?app_id=7&no_trap=1&redirect_uri=${encodeURIComponent(openBaseUrl() + "/")}`;
}

/** 应用列表页 */
export function appPageUrl(): string {
  return `${openBaseUrl()}/app`;
}
