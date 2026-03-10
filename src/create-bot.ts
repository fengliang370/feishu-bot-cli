import * as lark from "@larksuiteoapi/node-sdk";
import { DEFAULT_IMAGE_BASE64 } from "./default-image.js";
import type { Credentials, CreateBotOptions, CreateBotResult, FeishuApiResponse } from "./types.js";
import { apiBase, openBaseUrl, appPageUrl, passportBaseUrl, getPlatform, appName } from "./platform.js";

// ==================== 权限 scope 名称 → ID 映射 ====================
// ID 来源：/developers/v1/scope/applied/{appId} 接口返回
// scopeIdentityType: 2 = tenant (appScopeIDs), 1 = user (userScopeIDs)

const SCOPE_IDS = {
  tenant: [
    // --- 应用信息 ---
    "8108",    // application:application:self_manage
    // --- 卡片 ---
    "1014131", // cardkit:card:read
    "1014132", // cardkit:card:write
    // --- 通讯录 ---
    "100032",  // contact:contact.base:readonly
    "14",      // contact:user.base:readonly
    "3",       // contact:user.employee_id:readonly
    // --- 云文档 ---
    "41003",   // docx:document:readonly
    // --- 事件订阅 ---
    "44001",   // event:ip_list
    // --- 消息与群组 ---
    "1014164", // im:chat.access_event.bot_p2p_chat:read
    "1014186", // im:chat.members:bot_access
    "1014181", // im:chat:read
    "1014179", // im:chat:update
    "20001",   // im:message
    "3001",    // im:message.group_at_msg:readonly
    "20012",   // im:message.group_msg
    "3000",    // im:message.p2p_msg:readonly
    "1014177", // im:message.pins:read
    "1014174", // im:message.pins:write_only
    "1014176", // im:message.reactions:read
    "1014175", // im:message.reactions:write_only
    "20008",   // im:message:readonly
    "20006",   // im:message:recall
    "1000",    // im:message:send_as_bot
    "1005",    // im:message:send_multi_users
    "1014165", // im:message:send_sys_msg
    "20004",   // im:message:update
    "20009",   // im:resource
  ],
  user: [
    // --- 多维表格 ---
    "1014365", // base:app:copy
    "1014381", // base:app:create
    "1014379", // base:app:read
    "1014380", // base:app:update
    "1014368", // base:field:create
    "1014374", // base:field:delete
    "1014373", // base:field:read
    "1014375", // base:field:update
    "1014367", // base:record:create
    "1014370", // base:record:delete
    "1014369", // base:record:retrieve
    "1014371", // base:record:update
    "1014378", // base:table:create
    "1014376", // base:table:delete
    "1014366", // base:table:read
    "1014377", // base:table:update
    "1014392", // base:view:read
    "1014393", // base:view:write_only
    // --- 画板 ---
    "1013919", // board:whiteboard:node:create
    "1013920", // board:whiteboard:node:read
    // --- 日历 ---
    "1014247", // calendar:calendar.event:create
    "1014249", // calendar:calendar.event:delete
    "1014251", // calendar:calendar.event:read
    "1014250", // calendar:calendar.event:reply
    "1014248", // calendar:calendar.event:update
    "1014252", // calendar:calendar.free_busy:read
    "1014242", // calendar:calendar:read
    // --- 通讯录 ---
    "100032",  // contact:contact.base:readonly
    "14",      // contact:user.base:readonly
    "3",       // contact:user.employee_id:readonly
    "14000",   // contact:user:search
    // --- 云文档 ---
    "1014848", // docs:document.comment:create
    "101588",  // docs:document.comment:read
    "1014849", // docs:document.comment:update
    "1013973", // docs:document.media:download
    "1013974", // docs:document.media:upload
    "101592",  // docs:document:copy
    "1013986", // docs:document:export
    "1013971", // docx:document:create
    "41003",   // docx:document:readonly
    "1014878", // docx:document:write_only
    // --- 云空间 ---
    "26004",   // drive:drive.metadata:readonly
    "1013982", // drive:file:download
    "101589",  // drive:file:upload
    // --- 消息与群组 ---
    "1014164", // im:chat.access_event.bot_p2p_chat:read
    "1014185", // im:chat.members:read
    "1014181", // im:chat:read
    "20001",   // im:message
    "1015030", // im:message.group_msg:get_as_user
    "1015031", // im:message.p2p_msg:get_as_user
    "20008",   // im:message:readonly
    // --- 身份验证 ---
    "1014206", // offline_access
    // --- 搜索 ---
    "1014121", // search:docs:read
    "23104",   // search:message
    // --- 电子表格 ---
    "1013978", // sheets:spreadsheet.meta:read
    "1013979", // sheets:spreadsheet:create
    "1014230", // sheets:spreadsheet:read
    "1014229", // sheets:spreadsheet:write_only
    // --- 云空间文件夹 ---
    "101596",  // space:document:delete
    "101591",  // space:document:move
    "101595",  // space:document:retrieve
    // --- 任务 ---
    "16205",   // task:comment:read
    "16206",   // task:comment:write
    "16201",   // task:task:read
    "16202",   // task:task:write
    "1014840", // task:task:writeonly
    "16203",   // task:tasklist:read
    "16204",   // task:tasklist:write
    // --- 知识空间 ---
    "1014344", // wiki:node:copy
    "1014345", // wiki:node:create
    "1014343", // wiki:node:move
    "1014354", // wiki:node:read
    "1014346", // wiki:node:retrieve
    "1014353", // wiki:space:read
    "1014352", // wiki:space:retrieve
    "1014355", // wiki:space:write_only
  ],
};

// ==================== HTTP 辅助 ====================

function makeHeaders(creds: Credentials): Record<string, string> {
  // 确保 cookie 中包含 lark_oapi_csrf_token（飞书 CSRF 双重校验）
  let cookie = creds.cookieString;
  if (creds.csrfToken && !cookie.includes("lark_oapi_csrf_token=")) {
    cookie += `; lark_oapi_csrf_token=${creds.csrfToken}`;
  }

  return {
    "Content-Type": "application/json",
    Cookie: cookie,
    "x-csrf-token": creds.csrfToken,
    "x-timezone-offset": "-480",
    Origin: openBaseUrl(),
    Referer: appPageUrl(),
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  };
}

async function post<T = unknown>(
  creds: Credentials,
  path: string,
  body: Record<string, unknown> = {}
): Promise<FeishuApiResponse<T>> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: makeHeaders(creds),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText} for ${path}`);
  }

  const json = (await res.json()) as FeishuApiResponse<T>;
  if (json.code !== 0) {
    throw new Error(`API 错误 (${path}): code=${json.code}, msg=${json.msg || ""}`);
  }

  return json;
}

/**
 * 预热 anygen gateway — 发送 Feishu 标准 challenge 验证请求，确保 gateway 就绪。
 *
 * 飞书在设置 HTTP 回调 URL 时会立即发 challenge 验证请求到 requestUrl，
 * gateway 必须在那个瞬间能正确响应 {"challenge": "xxx"}。
 * 我们提前发一次 challenge 来确保 gateway 已经启动并且路由正常。
 */
async function warmUpGateway(webhookUrl: string): Promise<boolean> {
  const challenge = `warmup-${Date.now()}`;
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "url_verification", challenge, token: "" }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const body = await res.json() as Record<string, unknown>;
        if (body.challenge === challenge) {
          console.log("  Gateway 预热成功，challenge 验证通过");
          return true;
        }
        console.log(`  Gateway 预热: 响应异常 ${JSON.stringify(body).slice(0, 200)}`);
      } else {
        console.log(`  Gateway 预热: HTTP ${res.status}`);
      }
    } catch (err) {
      console.log(`  Gateway 预热 (${i}/3): ${err instanceof Error ? err.message : String(err)}`);
    }
    if (i < 3) await new Promise((r) => setTimeout(r, 1000));
  }
  console.log("  ⚠️ Gateway 预热失败，仍将尝试配置 webhook");
  return false;
}

/**
 * 带详细日志的 POST — 不检查 code，返回完整响应并打印关键字段。
 * 用于 webhook 配置场景，需要看到 data 内容来判断是否真正成功。
 */
async function postVerbose<T = unknown>(
  creds: Credentials,
  path: string,
  body: Record<string, unknown>,
  label: string
): Promise<FeishuApiResponse<T>> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: makeHeaders(creds),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${res.statusText} for ${path} — ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as FeishuApiResponse<T>;
  console.log(`  [${label}] code=${json.code}, msg=${json.msg || ""}, data=${JSON.stringify(json.data).slice(0, 300)}`);
  return json;
}

// ==================== 各步骤实现 ====================

/** 上传应用图标 */
async function uploadImage(creds: Credentials): Promise<string> {
  const imageBuffer = Buffer.from(DEFAULT_IMAGE_BASE64, "base64");
  const file = new File([imageBuffer], "image.png", { type: "image/png" });

  const form = new FormData();
  form.append("file", file);
  form.append("uploadType", "4");
  form.append("isIsv", "false");
  form.append("scale", JSON.stringify({ width: 240, height: 240 }));

  const headers = makeHeaders(creds);
  delete headers["Content-Type"]; // 让 fetch 自动设置 multipart boundary

  const res = await fetch(`${apiBase()}/app/upload/image`, {
    method: "POST",
    headers,
    body: form,
  });

  if (!res.ok) {
    console.error(await res.text());
    throw new Error(`上传图片失败: HTTP ${res.status}`);
  }

  const json = (await res.json()) as FeishuApiResponse<{ url: string }>;
  if (json.code !== 0) {
    throw new Error(`上传图片 API 错误: code=${json.code}, msg=${json.msg || ""}`);
  }

  const url = json.data.url;
  if (!url) throw new Error("上传图片失败：未返回 URL");
  return url;
}

/** Step 1: 创建应用 */
async function createApp(
  creds: Credentials,
  name: string,
  desc: string,
  avatar: string
): Promise<string> {
  const result = await post<{ ClientID: string }>(creds, "/app/create", {
    appSceneType: 0,
    name,
    desc,
    avatar,
    i18n: {
      zh_cn: { name, description: desc },
    },
    primaryLang: "zh_cn",
  });

  const appId = result.data.ClientID;
  if (!appId) throw new Error("创建应用失败：未返回 App ID");
  return appId;
}

/** Step 2: 获取 App Secret */
async function getAppSecret(creds: Credentials, appId: string): Promise<string> {
  const result = await post<{ secret: string }>(creds, `/secret/${appId}`);
  const secret = result.data.secret;
  if (!secret) throw new Error("获取 App Secret 失败");
  return secret;
}

/** Step 3: 启用机器人开关 + 创建机器人功能 */
async function enableBot(creds: Credentials, appId: string): Promise<void> {
  await post(creds, `/robot/switch/${appId}`, { enable: true });
  await post(creds, `/robot/${appId}`);
}

/** Step 4: 导入权限 */
async function updateScopes(creds: Credentials, appId: string): Promise<void> {
  await post(creds, `/scope/update/${appId}`, {
    appScopeIDs: SCOPE_IDS.tenant,
    userScopeIDs: SCOPE_IDS.user,
    scopeIds: [],
    operation: "add",
    isDeveloperPanel: true,
  });
}


/**
 * 获取应用的事件配置（包含 verificationToken）
 *
 * 飞书为每个应用自动生成 verificationToken，
 * 配置 HTTP 回调 URL 时必须携带此 token。
 */
async function getEventConfig(creds: Credentials, appId: string): Promise<{ verificationToken: string; encryptKey: string }> {
  const res = await postVerbose<{ verificationToken?: string; encryptKey?: string }>(creds, `/event/${appId}`, {
    needEventDetail: true,
  }, "event/config");

  const token = res.data?.verificationToken;
  if (!token) {
    throw new Error("获取 verificationToken 失败，响应: " + JSON.stringify(res.data).slice(0, 300));
  }
  return { verificationToken: token, encryptKey: res.data?.encryptKey || "" };
}

/**
 * Step 5: 配置 Webhook 回调 URL
 *
 * 飞书配置 HTTP 回调的正确流程（从开发者后台前端抓包确认）：
 *   1. POST /event/{appId}          → 获取 verificationToken
 *   2. POST /event/check_url/{appId} → 验证并保存 webhook URL
 *   3. POST /event/switch/{appId}    → 切换事件模式为 HTTP 回调 (eventMode: 1)
 *
 * /event/switch 只负责切模式，不处理 URL。
 * /event/check_url 才是真正保存 URL 的接口。
 */
async function configureWebhook(creds: Credentials, appId: string, webhookUrl: string): Promise<void> {
  // 1. 获取 verificationToken
  const { verificationToken } = await getEventConfig(creds, appId);
  console.log(`  Verification Token: ${verificationToken}`);

  // 2. 预热 gateway + 验证并保存 URL（最多重试 5 次）
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (attempt > 1) {
      console.log(`  重试 check_url (${attempt}/5)...`);
    }

    await warmUpGateway(webhookUrl);

    const res = await postVerbose<{ access?: boolean; msg?: string }>(creds, `/event/check_url/${appId}`, {
      verificationToken,
      verificationUrl: webhookUrl,
    }, "event/check_url");

    if (res.code === 0 && res.data?.access === true) {
      console.log("  \u2705 Webhook URL \u9a8c\u8bc1\u5e76\u4fdd\u5b58\u6210\u529f");
      break;
    }

    const reason = res.data?.msg || `code=${res.code}`;
    console.log(`  \u274c check_url \u5931\u8d25: ${reason}`);
    if (attempt === 5) {
      throw new Error(`Webhook URL \u9a8c\u8bc1\u5931\u8d25\uff08\u5df2\u91cd\u8bd5 5 \u6b21\uff09: ${reason}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // 3. 切换事件模式为 HTTP 回调
  await postVerbose(creds, `/event/switch/${appId}`, {
    eventMode: 1,
  }, "event/switch");
  console.log("  ✅ 事件模式已切换为 HTTP 回调");
}

/** Step 6: 添加事件订阅 */
async function addEventSubscription(creds: Credentials, appId: string): Promise<void> {
  await post(creds, `/event/update/${appId}`, {
    operation: "add",
    events: [],
    appEvents: ["im.message.receive_v1", "im.message.reaction.created_v1", "im.message.reaction.deleted_v1"],
    userEvents: [],
    eventMode: 1,
  });
}

/** 获取当前登录用户的内部 user ID（从 passport 接口） */
async function getCreatorInternalId(creds: Credentials): Promise<string> {
  const url = `${passportBaseUrl()}/accounts/web/user?app_id=7&support_anonymous=0&_t=${Date.now()}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Cookie: creds.cookieString,
      "X-Api-Version": "1.0.28",
      "X-App-Id": "7",
      "X-Device-Info": "platform=websdk",
      Origin: openBaseUrl(),
      Referer: `${openBaseUrl()}/`,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) throw new Error(`获取用户信息失败: HTTP ${res.status}`);

  const json = (await res.json()) as FeishuApiResponse<{ user?: { id?: string } }>;
  const userId = json.data?.user?.id;
  if (json.code !== 0 || !userId) {
    throw new Error("无法从 passport 获取用户 ID");
  }

  return userId;
}

/** Step 8: 创建版本并发布 */
async function createVersionAndPublish(
  creds: Credentials,
  appId: string,
  creatorId: string
): Promise<string> {
  const result = await post<{ versionId: string }>(creds, `/app_version/create/${appId}`, {
    appVersion: "0.0.1",
    mobileDefaultAbility: "bot",
    pcDefaultAbility: "bot",
    changeLog: "0.0.1",
    visibleSuggest: {
      departments: [],
      members: [creatorId],
      groups: [],
      isAll: 0,
    },
    applyReasonConfig: {
      apiPrivilegeNeedReason: false,
      contactPrivilegeNeedReason: false,
      dataPrivilegeReasonMap: {},
      visibleScopeNeedReason: false,
      apiPrivilegeReasonMap: {},
      contactPrivilegeReason: "",
      isDataPrivilegeExpandMap: {},
      visibleScopeReason: "",
      dataPrivilegeNeedReason: false,
      isAutoAudit: false,
      isContactExpand: false,
    },
    b2cShareSuggest: false,
    autoPublish: false,
    blackVisibleSuggest: {
      departments: [],
      members: [],
      groups: [],
      isAll: 0,
    },
  });

  const versionId = result.data.versionId;
  if (!versionId) throw new Error("创建版本失败：未返回版本 ID");

  // 提交发布
  await post(creds, `/publish/commit/${appId}/${versionId}`);
  return versionId;
}

/** 将内部 user ID 转换为 open_id */
async function transformToOpenId(
  creds: Credentials,
  internalId: string,
  clientId: string
): Promise<string> {
  const res = await fetch(`${openBaseUrl()}/api_explorer/v1/resource_id/transform`, {
    method: "POST",
    headers: makeHeaders(creds),
    body: JSON.stringify({
      resource: "user",
      id: internalId,
      clientId,
    }),
  });

  if (!res.ok) throw new Error(`转换 ID 失败: HTTP ${res.status}`);

  const json = (await res.json()) as FeishuApiResponse<{ ids?: { open_id?: string } }>;
  if (json.code !== 0 || !json.data?.ids?.open_id) {
    throw new Error("转换 open_id 失败");
  }

  return json.data.ids.open_id;
}

/** 通过 bot 发送成功消息给创建者 */
async function sendSuccessMessage(
  appId: string,
  appSecret: string,
  openId: string,
  result: CreateBotResult
): Promise<void> {
  const client = new lark.Client({
    appId,
    appSecret,
    domain: getPlatform() === "lark" ? lark.Domain.Lark : lark.Domain.Feishu,
  });

  const content = JSON.stringify({
    text: [
      `🤖 ${appName()}机器人创建成功！`,
      "",
      `名称: ${result.name}`,
      `描述: ${result.desc}`,
      `App ID: ${result.appId}`,
      `App Secret: ${result.appSecret}`,
      `应用链接: ${openBaseUrl()}/app/${result.appId}`,
      `版本链接: ${openBaseUrl()}/app/${result.appId}/version/${result.versionId}`,
    ].join("\n"),
  });

  await client.im.v1.message.create({
    params: { receive_id_type: "open_id" },
    data: {
      receive_id: openId,
      msg_type: "text",
      content,
    },
  });
}

// ==================== 主流程 ====================

/**
 * 一键创建飞书机器人应用（Webhook 回调模式）
 *
 * 完整流程（9步）：
 * 1. 上传应用图标
 * 2. 创建应用 → 获取 App ID
 * 3. 获取 App Secret
 * 4. 启用机器人能力
 * 5. 导入权限（27 tenant + 76 user）
 * 6. 配置 Webhook: 获取 verificationToken → check_url 保存 URL → 切换 eventMode
 * 7. 订阅事件（im.message.receive_v1, im.message.reaction.created_v1, im.message.reaction.deleted_v1）
 * 8. 创建版本 0.0.1 并提交发布
 * 9. 通过机器人发送飞书通知给创建者
 */
export async function createBot(
  creds: Credentials,
  options: CreateBotOptions
): Promise<CreateBotResult> {
  const { name, desc, webhookUrl } = options;

  // Step 1: 上传应用图标
  console.log("[1/9] 上传应用图标...");
  const avatar = await uploadImage(creds);

  // Step 2: 创建应用
  console.log(`[2/9] 创建应用 "${name}"...`);
  const appId = await createApp(creds, name, desc, avatar);
  console.log(`  App ID: ${appId}`);
  console.log(`  ${openBaseUrl()}/app/${appId}`);

  // Step 3: 获取 App Secret
  console.log("[3/9] 获取 App Secret...");
  const appSecret = await getAppSecret(creds, appId);
  console.log(`  App Secret: ${appSecret}`);

  // Step 4: 启用机器人
  console.log("[4/9] 启用机器人功能...");
  await enableBot(creds, appId);

  // Step 5: 导入权限
  console.log(`[5/9] 导入权限列表 (${SCOPE_IDS.tenant.length} tenant + ${SCOPE_IDS.user.length} user)...`);
  await updateScopes(creds, appId);

  // Step 6: 配置 Webhook 回调（预热 gateway + 最多重试 5 次）
  console.log("[6/9] 配置 Webhook 回调...");
  console.log(`  URL: ${webhookUrl}`);
  await configureWebhook(creds, appId, webhookUrl);

  // Step 7: 添加事件订阅
  console.log("[7/9] 添加事件订阅 (receive + reaction.created + reaction.deleted)...");
  await addEventSubscription(creds, appId);

  // Step 8: 获取当前用户 ID + 创建版本并发布
  console.log("[8/9] 获取用户信息并创建版本 0.0.1...");
  const internalId = await getCreatorInternalId(creds);
  const versionId = await createVersionAndPublish(creds, appId, internalId);

  const result: CreateBotResult = { appId, appSecret, versionId, name, desc };

  // Step 9: 发送飞书消息通知创建者
  console.log(`[9/9] 发送${appName()}通知...`);
  try {
    const openId = await transformToOpenId(creds, internalId, appId);
    await sendSuccessMessage(appId, appSecret, openId, result);
    console.log(`  已发送成功通知到${appName()}`);
  } catch (err) {
    console.log(
      `  通知发送失败（不影响创建结果）: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return result;
}
