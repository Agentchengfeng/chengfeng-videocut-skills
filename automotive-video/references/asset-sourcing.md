# 汽车素材搜集与入库

## 工作单元

从本期口播稿或转录提取：画面目的、对象、品牌车型年款/配置、视角、场景、预计覆盖长度。先使用本期明确指定的素材，再检索自有库；不足时通过已提供的联网工具检索官方媒体中心、官网资料、官方视频或用户允许的素材源。检索需要原始视频时明确查询 video / footage / B-roll / 发布会 / 动态，不把一批静态图当成视频素材已齐全。

搜集本身不是素材身份或使用授权证明。记录原始页面、直链、作者/机构、已知使用范围和待确认信息；品牌字形来源是 Simple Icons 时如实记录社区字形，不标成厂家原文件。

## 取得文件

网页原始素材直链支持：

```sh
node bin/auto-video.mjs fetch "<直链>" --id "car.brand.model.side" --name "车型侧面行驶" --category footage --brand "<品牌>" --model "<车型>" --year "<年款>" --view side --representation photo --tags "车型,行驶,侧面" --usage "<已知使用范围>"
```

`fetch` 对原始图片或视频进行下载、元数据检查和入库；网页、登录页、平台视频播放页不能直接当媒体。遇到限制时使用用户已有文件或其他允许来源，保留缺口。不开通付费订阅、不突破认证、不自动修改水印。

本地目录：

```sh
node bin/auto-video.mjs batch-import "<素材目录>"
```

扫描目录内支持的普通文件，不递归扫全盘，不移动或覆盖原文件。可在原文件旁提供 `文件.svg.asset.json`：

```json
{
  "id": "car.user-model.side",
  "name": "我的车型侧视图",
  "category": "vehicles",
  "brand": "用户提供的品牌",
  "model": "用户提供的车型",
  "year": "用户确认的年款",
  "view": "side",
  "representation": "photo",
  "tags": ["车型", "侧视", "透明背景"],
  "source": "用户提供",
  "usage": "user-provided"
}
```

无资料卡时自动生成稳定 ID，以原文件名作为检索词，并保留“待标注”。AI 实际看图后补标签；不确定品牌/车型保留 unknown。

## 视频镜头

入库会用 ffprobe 读尺寸/帧率/时长并抽取缩略图。之后进一步抽帧，核对车型与内容，将可用片段标成素材局部秒数 `in/out`，附景别、运动方向和内容说明。镜头不足时继续搜集，避免未经说明地循环、拉伸或变速凑时长。项目片段使用 `sourceIn/sourceOut`；旁白继续来自母版，B-roll 静音。

`search "车轮"` 按名称、标签、品牌、车型等文本查找；空格分隔关键词为 AND。`--category --brand --view --representation` 是精确筛选。返回后仍需实际看预览，不只凭匹配结果选用。

## 版本与保存

自有库位于工具包 `library/user/`，原始内置库在 `library/assets/`。用户资产和视频项目不会进入上游插件缓存。原文件复制入库，记录 SHA-256；同 ID 同版本不同内容会拒绝覆盖。新增版本不会改动旧文件。

项目第一次准备时复制使用到的素材，并把完整资料卡和版本写到 `assets.lock.json`。后续渲染优先读取项目快照。用户明确要求升级素材时才 `prepare --refresh-lock`，并重新检查画面。
