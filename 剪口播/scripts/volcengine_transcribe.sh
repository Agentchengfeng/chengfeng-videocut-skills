#!/bin/bash
# 火山引擎语音识别（大模型录音文件识别 v3 异步模式）
#
# 用法: ./volcengine_transcribe.sh <audio_url>
# 输出: volcengine_result.json
#

set -euo pipefail

AUDIO_URL="${1:-}"

if [ -z "$AUDIO_URL" ]; then
  echo "❌ 用法: ./volcengine_transcribe.sh <audio_url>"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$(dirname "$(dirname "$SCRIPT_DIR")")/.env"

get_env_value() {
  local key="$1"
  if [ ! -f "$ENV_FILE" ]; then
    return 0
  fi

  grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d'=' -f2- | sed 's/^["'\'']//; s/["'\'']$//'
}

API_KEY="${VOLCENGINE_API_KEY:-$(get_env_value VOLCENGINE_API_KEY || true)}"
RESOURCE_ID="${VOLCENGINE_RESOURCE_ID:-$(get_env_value VOLCENGINE_RESOURCE_ID || true)}"
RESOURCE_ID="${RESOURCE_ID:-volc.seedasr.auc}"

if [ -z "$API_KEY" ] || [ "$API_KEY" = "your_volcengine_api_key_here" ]; then
  echo "❌ 请设置 VOLCENGINE_API_KEY，或在 $ENV_FILE 填入有效的 VOLCENGINE_API_KEY"
  exit 1
fi

echo "🎤 提交火山引擎转录任务..."
echo "音频 URL: $AUDIO_URL"

# 读取热词词典
DICT_FILE="$(dirname "$SCRIPT_DIR")/字幕/词典.txt"
HOT_WORDS=""
if [ -f "$DICT_FILE" ]; then
  # 把词典转换成 JSON 数组格式
  HOT_WORDS=$(cat "$DICT_FILE" | grep -v '^$' | while read word; do echo "\"$word\""; done | tr '\n' ',' | sed 's/,$//')
  echo "📖 加载热词: $(cat "$DICT_FILE" | grep -v '^$' | wc -l | tr -d ' ') 个"
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

TASK_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
SUBMIT_BODY="$TMP_DIR/submit_body.json"
SUBMIT_HEADERS="$TMP_DIR/submit_headers.txt"
SUBMIT_RESPONSE="$TMP_DIR/submit_response.json"
QUERY_HEADERS="$TMP_DIR/query_headers.txt"
QUERY_RESPONSE_FILE="$TMP_DIR/query_response.json"

node - "$AUDIO_URL" "$HOT_WORDS" > "$SUBMIT_BODY" <<'NODE'
const audioUrl = process.argv[2];
const hotWordsRaw = process.argv[3] || "";

const body = {
  user: { uid: "codex-videocut" },
  audio: {
    format: "mp3",
    url: audioUrl
  },
  request: {
    model_name: "bigmodel",
    enable_itn: true,
    enable_punc: true,
    show_utterances: true
  }
};

if (hotWordsRaw.trim()) {
  const hotwords = hotWordsRaw
    .split(",")
    .map((item) => item.trim().replace(/^"|"$/g, ""))
    .filter(Boolean)
    .map((word) => ({ word }));

  if (hotwords.length) {
    body.request.corpus = {
      context: JSON.stringify({ hotwords })
    };
  }
}

process.stdout.write(JSON.stringify(body));
NODE

# 步骤1: 提交任务
curl -sS -L -D "$SUBMIT_HEADERS" -o "$SUBMIT_RESPONSE" -X POST "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $API_KEY" \
  -H "X-Api-Resource-Id: $RESOURCE_ID" \
  -H "X-Api-Request-Id: $TASK_ID" \
  -H "X-Api-Sequence: -1" \
  --data-binary "@$SUBMIT_BODY"

get_header_value() {
  local file="$1"
  local key="$2"
  awk -v key="$(printf '%s' "$key" | tr '[:upper:]' '[:lower:]')" '{
    line = $0
    gsub("\r", "", line)
    lower = tolower(line)
    if (index(lower, key ":") == 1) {
      sub("^[^:]+:[[:space:]]*", "", line)
      print line
      exit
    }
  }' "$file"
}

SUBMIT_STATUS="$(get_header_value "$SUBMIT_HEADERS" "X-Api-Status-Code")"
SUBMIT_MESSAGE="$(get_header_value "$SUBMIT_HEADERS" "X-Api-Message")"

if [ "$SUBMIT_STATUS" != "20000000" ]; then
  echo "❌ 提交失败，响应:"
  echo "status=$SUBMIT_STATUS message=$SUBMIT_MESSAGE"
  cat "$SUBMIT_RESPONSE"
  exit 1
fi

echo "✅ 任务已提交，ID: $TASK_ID"
echo "⏳ 等待转录完成..."

# 步骤2: 轮询结果
MAX_ATTEMPTS=120  # 最多等待 10 分钟（每 5 秒查一次）
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  sleep 5
  ATTEMPT=$((ATTEMPT + 1))

  curl -sS -L -D "$QUERY_HEADERS" -o "$QUERY_RESPONSE_FILE" -X POST "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: $API_KEY" \
    -H "X-Api-Resource-Id: $RESOURCE_ID" \
    -H "X-Api-Request-Id: $TASK_ID" \
    --data-binary '{}'

  # 检查状态
  STATUS="$(get_header_value "$QUERY_HEADERS" "X-Api-Status-Code")"
  MESSAGE="$(get_header_value "$QUERY_HEADERS" "X-Api-Message")"

  if [ "$STATUS" = "20000000" ]; then
    cp "$QUERY_RESPONSE_FILE" volcengine_result.json
    echo "✅ 转录完成，已保存 volcengine_result.json"

    UTTERANCES=$(node - <<'NODE'
const fs = require('fs');
const result = JSON.parse(fs.readFileSync('volcengine_result.json', 'utf8'));
const utterances = result.utterances || result.result?.utterances || [];
console.log(utterances.length);
NODE
)
    echo "📝 识别到 $UTTERANCES 段语音"
    exit 0
  elif [ "$STATUS" = "20000003" ]; then
    cp "$QUERY_RESPONSE_FILE" volcengine_result.json
    echo "⚠️ 未检测到有效人声，已保存 volcengine_result.json"
    exit 0
  elif [ "$STATUS" = "20000001" ] || [ "$STATUS" = "20000002" ]; then
    # 处理中
    echo -n "."
  else
    # 其他错误
    echo ""
    echo "❌ 转录失败，响应:"
    echo "status=$STATUS message=$MESSAGE"
    cat "$QUERY_RESPONSE_FILE"
    exit 1
  fi
done

echo ""
echo "❌ 超时，任务未完成"
exit 1
