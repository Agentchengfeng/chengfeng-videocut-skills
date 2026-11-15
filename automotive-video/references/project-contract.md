# 粗剪项目与时间线

本工具包是独立合成流程，不直接修改 chengfeng 的工程 JSON 或缓存。`project.json` 是本工具包自己的项目格式。

## 母版

`init` 复制输入文件为 `media/master.<ext>` 并记录 SHA-256、尺寸、帧率、时长和音轨。默认不删词、不压停顿、不重排、不改声音；所有覆盖层按母版时间定位。母版与字幕不一致时重建正确输入，不能仅替换哈希。

同步 SRT 的时间就是当前粗剪视频时间。没有 SRT 时可用已配置火山极速识别 `transcribe`，需要 `volc.bigasr.auc_turbo` 资源权限。凭证从 `VOLCENGINE_API_KEY` 或 `~/.config/auto-video/env` 获取，文件一行 `VOLCENGINE_API_KEY=...`。不把密钥放进项目、命令行或日志。首次设置可沿用用户已授权的凭证管理方式；本工具包不会猜测或复制其他项目密钥。

云端识别适配按官方接口实现并有离线响应解析测试；是否有可用凭证、账号资源权限和真实识别结果需在实际调用时验证。已有字幕不会自动重转录覆盖。`captions` 可导入人工校对后的 SRT。

## 时间线片段

所有 `start/end` 都是母版秒数，覆盖画面不增加片长。字幕 `start/end` 同样使用母版时间；`transcript.json` 可保留真实词级时间供 AI 精确对齐动作。外部素材的 `sourceIn/sourceOut` 是素材自身秒数。

```json
{
  "id": "scene-energy-01",
  "kind": "scene",
  "type": "energy",
  "preset": "energy.drive.v1",
  "start": 12.2,
  "end": 19.8,
  "title": "能量怎样到达车轮",
  "transition": "fade",
  "assetSlots": { "battery": "part.battery.documentary" }
}
```

预设 ID 决定具体动作，`assetSlots` 复用素材快照机制，省略的素材位沿用该预设的默认素材。主题和粒子参数适用于兼容场景和独立动效。复制组件库配置后，按本期口播填写唯一片段 ID 和母版起止时间。

视频覆盖：

```json
{
  "id": "broll-01",
  "kind": "video",
  "assetId": "footage.verified-car",
  "start": 20,
  "end": 24,
  "sourceIn": 3,
  "sourceOut": 7,
  "fit": "cover",
  "transition": "cut"
}
```

静态图片用 `kind:"image"` 和 `assetId`。`fit:contain` 保留全图，cover 会裁边。素材不足覆盖时长直接报错，不偷偷循环。视频覆盖保持静音。重叠片段按数组后者在上，验证会给出提示。`transition:fade/wipe` 控制进入，独立 `exitTransition:fade` 控制淡出，均不改变母版时长。相邻镜头连续混合时让后一层提前约 0.3 秒进入，前一层保持不淡出，这样新层在旧画面上完成进入，避免露出底片。真实时长以当前帧率和实际画面验收。

字幕样式为画面宽度比例字号、底部百分比和最大宽度。AI 根据真实语义拆分超长字幕，不用均分时间伪造逐词时间。

## 渲染与验收

prepare 校验母版、素材、版本和边界并生成渲染输入。render 使用同一纯帧逻辑，在粗剪母版之上绘制覆盖层和字幕，H.264 MP4 或 VP9 透明 WebM。模板场景是参数统一控制，细节修改以项目 clip ID 为单位；不宣称 Studio 源码节点支持任意片段独立源码回写。

命令完成后读取 `verification.json`：尺寸、时长、音轨和哈希属于技术检查；输出抽帧才是视觉证据，人工听音须有实际记录。不要把离线合成测试写成真实汽车成片验收。

`inspect-render <project.json> --video <实际输出.mp4> --out <检查目录>` 自动抽取起止、镜头中间、部分边界帧并生成 `contact-sheet.png` 与 `inspection.json`。超过 24 个选点时会采样并如实标注覆盖范围；需要补查的场景应继续抽帧。生成联系表不自动升级为 visual PASS，须实际查看。

音效在画面确定后最后处理。`soundEffects` 暂存后续加音效的意图，本版不渲染该清单；原口播在 MP4 中保留。独立视频素材、透明动效和源码是否分开交付遵循当前任务。
