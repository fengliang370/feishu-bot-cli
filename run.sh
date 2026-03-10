#!/bin/bash
# 飞书机器人一键创建脚本
# 用法: ./run.sh "<webhook_url>" [机器人名称] [机器人描述]
#
# 注意: URL 包含 ? 和 & 等特殊字符，必须用双引号包裹！
#
# 示例:
#   ./run.sh "https://example.com/webhook?token=xxx&env=prod"
#   ./run.sh "https://example.com/webhook?token=xxx" "我的机器人"
#   ./run.sh "https://example.com/webhook?token=xxx" "我的机器人" "这是一个测试机器人"

set -e

WEBHOOK_URL="${1:?用法: ./run.sh <webhook_url> [名称] [描述]}"
NAME="${2:-my-bot}"
DESC="${3:-$NAME}"

cd "$(dirname "$0")"

# 直接跑 TypeScript 源码，无需编译
npx tsx src/index.ts create-bot --webhook-url "$WEBHOOK_URL" --name "$NAME" --desc "$DESC"
