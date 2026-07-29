---
name: chengfeng-check-videocut-updates
description: 检查 chengfeng-videocut Skills 的 Marketplace 更新。用户说检查更新、检查剪辑 Skills 更新、更新 chengfeng-videocut Skills，或在已展示的可信版本后明确确认激活时使用；不用于 Runtime 更新、项目数据迁移或静默安装。
user-invocable: true
---

# 检查剪辑 Skills 更新

这是支持入口，不触碰 Product Runtime、项目、媒体或 live cache。只允许 Codex 官方 Marketplace 命令处理快照和激活。

```text
[纯 inspect] ------------------------> [不 refresh]
[用户明确说“检查更新”] --> [Git?] --> [官方 marketplace upgrade]
                                  |             |
                                  |             v
                                  |    [可信 ref + checksum?]
                                  |         | no       | yes
                                  v         v          v
                      [local not refreshable] [停止] [compare -> confirm -> add -> reread]
```

## 1. 只读 inspect 或用户请求的检查

从当前 Skill 定位脚本，并要求用户指定已配置的 Marketplace 名称：

```bash
PLUGIN_ROOT="$(codex plugin list --json | node -e 'let s=""; process.stdin.on("data", c => s += c); process.stdin.on("end", () => { const rows = JSON.parse(s).installed || []; const hit = rows.filter(x => x.enabled && x.name === "chengfeng-videocut" && x.source && x.source.path); if (hit.length !== 1) process.exit(1); process.stdout.write(hit[0].source.path); });')"
test -n "$PLUGIN_ROOT" && test -f "$PLUGIN_ROOT/.codex-plugin/plugin.json" || { echo "chengfeng-videocut enabled plugin root unavailable" >&2; exit 1; }
UPDATE="$PLUGIN_ROOT/scripts/check-plugin-update.cjs"
node "$UPDATE" --marketplace "$marketplaceName" --inspect --json
```

`PLUGIN_ROOT` 只来自上面已启用 Plugin 行的 `source.path`。不要依赖未保证存在的 `SKILL_DIR`、硬编码开发机路径或用目录搜索猜测安装位置。

`--inspect` 不 refresh。用户明确说“检查更新”后，才运行：

```bash
node "$UPDATE" --marketplace "$marketplaceName" --json
```

- `current`：报告 current/latest、Marketplace 与已刷新事实。
- `update_available_confirmation_required`：展示 installed、available、40-hex immutable commit、publisher SHA-256；停止等用户确认。
- `marketplace_not_refreshable`：本地 marketplace 不是远程更新源；不伪造 remote check。
- `update_metadata_untrusted`：缺 40-hex immutable commit、发布者包校验和，或 Codex snapshot 中可重算的包清单哈希不一致；裸 semver/tag 不能替代 commit，不下载、不调用 `plugin add`。官方 CLI 没有独立 stage 命令，因此不声称已 stage。
- 任何 refresh/parse/version 错误：保留结构化 JSON，停止；不复制目录、不删除 cache。

当前公开 Git 基线缺可用于激活的 immutable provenance 与 publisher checksum 时，正确结果是 `update_metadata_untrusted`；可见的新提交不是可安装更新。

## 2. 用户明确确认后才激活

确认必须发生在用户已看见 exact available version、ref 与 checksum 之后：

```bash
node "$UPDATE" --marketplace "$marketplaceName" --activate --confirmed \
  --expected-version "$shownVersion" --expected-ref "$shownImmutableRef" \
  --expected-sha256 "$shownPublisherSha256" --json
```

脚本通过官方 `codex plugin marketplace upgrade` 刷新 Git snapshot，重算 snapshot 内候选包的文件清单 SHA-256，并比对三个 `--expected-*` 值；随后才使用官方 `codex plugin add`。没有独立 stage：官方 refresh 的 snapshot 是唯一可检查来源。它必须从 `plugin add` 返回的 installed cache 路径复读 version、immutable ref、publisher SHA-256，并重算同一 inventory digest；Codex list 不含 ref/checksum 时只接受 installed `.codex-plugin/update-provenance.json` 的可验证来源，缺失即失败。只有四项都等于候选才报告 `activated`。激活成功后告知用户重启 Codex。

`plugin_activation_unsupported` 表示官方 CLI 没有原子选择该版本：停止，不删除 cache、复制 sources 或重装 Runtime 模拟升级。

## 边界

- Plugin 可升至 `0.5.2`，不等于 Runtime 更新；Runtime 最低兼容/Release 仍由 `runtime-requirements.json` 的 `0.2.1` 合同控制。
- 不把本地 staging、legacy cache 或 local marketplace 说成 remotely updatable。
- 不发布、不改 Product Runtime、5190、项目数据或媒体；用户确认后官方 Codex activation 是唯一写入例外。
