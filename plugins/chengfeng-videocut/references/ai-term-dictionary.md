# AI 用词词典

转录经常把 AI 圈的专名听错、或者同一个词写成好几种。这份词典给「修字」这一步用：
**认定哪个是正确写法，其余写法一律换成它。**

## 怎么用

```text
逐词稿
   |
   v
查这份词典 -> 得到 { wordId: 正确写法 } 的对照表
   |
   v
只改文字，不改时间     <- 时间是所有已做剪辑的地基
```

**这一步必须在「判断该删什么」之前做完。** 否则判断得一路绕开错名字——那是判据里
「专名听错不算删除理由」那条存在的原因，属于补丁，不是解法。

## 硬规矩

- **只改文字，不改时间、不改词数、不改 wordId。** 改了时间，所有已做的删除都会砍在错误位置。
- **只换写法，不换意思。** 说话人真的说错又重说，那是「残句改口」，归删词管，不归这里。
- **拿不准就不换。** 稿子里如果**没有任何一个正确写法出现过**，说明词典里没有，不许猜——
  往用户片子里塞一个编出来的名字，比留着一个听错的名字更坏。留着并报告。
- 同一族里选**出现次数最多的正确写法**做基准；次数相同时选官方写法。

## 词典

### 模型与产品

| 正确写法 | 常见误识别 |
| --- | --- |
| Grok | grok / Clock / Glock / Gokul / Croc / 格罗克 |
| Codex | CodeX / codex / Code X / codecs / Codax |
| Claude | claude / Cloud / Clode / 克劳德 |
| ChatGPT | chatgpt / Chat GPT |
| GPT-4 | GPT4 / gpt 4 / GBT4 |
| Gemini | gemini / Germany / 双子星 |
| DeepSeek | deepseek / Deep Seek |
| Qwen | qwen |
| Kimi | kimi / KIMI |
| Sora | sora / 索拉 |
| Midjourney | midjourney / Mid Journey / MJ |
| Cursor | cursor |
| Copilot | copilot / Co-pilot |

### 术语

| 正确写法 | 常见误识别 |
| --- | --- |
| Agent | agent |
| CLI | cli / C L I |
| API | api / A P I |
| MCP | mcp / M C P |
| Prompt | prompt |
| Token | token |
| RAG | rag / R A G |
| LLM | llm / L L M |
| Skill | skill |  <!-- 「Skills」是 Claude Skills 的复数专名，说话人真会这么说，不许换 -->
| Workflow | workflow |
| TTS | tts / T T S |
| ASR | asr / A S R |
| Runtime | runtime / Run Time |
| Artifact | artifact |
| B-roll | B roll / Broll / b-roll |
| Markdown | markdown / Mark Down |

### 公司与平台

| 正确写法 | 常见误识别 |
| --- | --- |
| OpenAI | openai / Open AI / 欧盆 AI |
| Anthropic | anthropic / 安索匹克 |
| xAI | XAI / x AI |
| GitHub | github / Git Hub / 吉特哈布 |
| Hugging Face | huggingface / Hugging face |

### 当前作者知识库高频专名

这些词来自已授权的 Obsidian `Creator Studio` Markdown 统计，只收录能确认的正式写法及
大小写、空格变体。词频只能证明“值得收录”，不能证明任意谐音就是它，因此没有证据的
误识别不写进词典。

| 正确写法 | 常见误识别 |
| --- | --- |
| Obsidian | obsidian |
| HyperFrames | Hyperframes / hyperframes / Hyper Frames |
| Chengfeng | chengfeng / Cheng Feng |
| TikHub | Tikhub / tikhub / Tik Hub |
| Creator Studio | CreatorStudio / creator studio |
| Video Maker | VideoMaker / video maker |

## 中文口语按原文保留，不要「纠正」

说话人用中文说「叉」「大模型」「智能体」「提示词」，**那就是他说的话，照原样保留**。
这份词典只处理**同一个专名的多种写法**和**明显的听错**，不做中英转换、不做术语统一。

判据是：换完之后，说话人本来会不会这么写？会 → 换。不会 → 不换。

## 词典里没有的

稿子里出现了词典没收录的专名，且**没有任何一个写法能确认是正确的**：

```text
报告   「Tibbo / tibor 各出现 1 次，两个都像听错，词典里没有，未修改」
不要   猜一个拼法填进去
```

报告之后由人补进词典，下次就认得了。

**已知待补**：`Tibbo` / `tibor`（某人名或产品名，上下文是「刚发布额度重置消息」）。
