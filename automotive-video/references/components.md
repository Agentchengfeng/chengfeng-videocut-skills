# 固定组件与参数

组件 ID 由 `node bin/auto-video.mjs list` 返回；目录 `node bin/auto-video.mjs catalog`，默认仅绑定本机 127.0.0.1:3211。目录页支持检索、选择、播放、拖动时间、改主题/密度/速度/强度和复制配置。预览和 Remotion 共用 `src/visuals.mjs` 的纯帧渲染逻辑。

## 可用动效

| ID       | 用途     | 内容                               |
| -------- | -------- | ---------------------------------- |
| ambient  | 背景     | 漂浮微光，适合长段低强度使用       |
| network  | 背景     | 二维节点与连线，不代表实际网络拓扑 |
| grid     | 背景     | 连续波动点阵                       |
| flow     | 解释辅助 | 沿二维曲线路径流动的粒子           |
| scan     | 对象揭示 | 扫描线与局部点亮                   |
| outline  | 对象揭示 | 粒子沿闭合二维轮廓移动             |
| dissolve | 聚散过渡 | 从分散到聚合再散开                 |
| sweep    | 短促过渡 | 二维方向光线                       |

`outline` 不指定对象时使用椭圆轮廓；`dissolve` 不指定对象时聚成抽象轮廓。为独立动效传入 `--asset-id logo.tesla` 或在场景设置 `assetId`，可以从透明图片/SVG 采样目标轮廓，聚合成目标字形或在其边界点亮粒子。这里是粒子轮廓效果，不是 SVG 路径逐笔描边。透明图最适合，不透明照片会把整张矩形采进来。

所有效果可调整：`params.color`（#RRGGBB）、`density`（8–200）、`speed`、`intensity`（0–1）、`seed`。主题：graphite、ice、paper。背景动效不自动进入每个镜头。

独立动效命令参数：`--width` / `--height`（偶数像素，默认 1280×720）、`--fps`（默认 30）、`--duration`（秒，默认 6）、`--theme`、`--color`、`--density`、`--speed`（0.05–10）、`--intensity`、`--seed`、`--asset-id`、`--transparent`。普通背景默认没有边框线，项目 JSON 可设 `params.frameLines=true`。

## 场景

### 工程纪录片预设

新剪辑用 `type` 指定场景，用 `preset` 选择镜头动作。组件库可以切换预设、换素材、预留两行字幕并复制片段 JSON。横竖画幅和字幕安全区以最终工程设置为准。

| type       | preset                                                                                                   | 素材位                                       |
| ---------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| sensor     | `sensor.cut-in.v1` 并线跟踪、`sensor.occlusion.v1` 行人从遮挡后出现、`sensor.coverage.v1` 前向与侧向覆盖 | `ego` 自车，`targetVehicle` 旁车或遮挡车     |
| suspension | `suspension.bump.v1` 驶过减速带                                                                          | `rig` 分层车辆，`params.amplitude` 起伏幅度  |
| energy     | `energy.drive.v1` 驱动、`energy.regen.v1` 回收                                                           | `battery` 电池，`motor` 电机，`wheel` 驱动轮 |
| compare    | `compare.baseline.v1` 同基线对比                                                                         | `left`、`right`，`labels` 可写两条短标签     |

感知用车头朝上、紧贴画布的俯视 SVG 或透明 PNG，导入用 `--category vehicles --view top`。悬架用不同横坐标的前后轮心，车轮图紧贴胎面边界裁切。电驱零件导入用 `--category parts`。对比接受 SVG、图片和分层 rig，底边对齐用于画面对照，实际尺寸比例需有单独依据。

`assetSlots` 可只写需要替换的项，留空时由预设填默认素材。`assetId` 可作为 `ego`、`rig` 或 `battery` 的简写，`assetIds` 是对比的 `left`、`right` 简写，显式素材位优先。预设的动作进度按片段长度映射，`title`、`subtitle`、`annotation` 可替换画面文案。已发布的预设 ID 应保持含义，重设计动作另开版本。

### 兼容场景

省略 `preset` 会沿用原场景，也可继续单独使用素材和动效。

| type       | 主要对象                     | 参数                                                 |
| ---------- | ---------------------------- | ---------------------------------------------------- |
| suspension | 分层车体、车轮、路面起伏     | `assetId` 车辆 rig；`params.amplitude` 路面起伏幅度  |
| energy     | 电池、电机、驱动轮与连接路径 | `assetId` 电池图；`params.reverse=true` 表示回收方向 |
| sensor     | 俯视车辆与二维扫描           | `assetId` 俯视车图                                   |
| compare    | 两个对象同构图对照           | `assetIds` 两个 ID；`labels` 两条短标签              |
| asset      | 单对象展示                   | `assetId`；实际素材与品牌字形保持原貌                |
| motion     | 独立背景或转场层             | `motion` 与上述 params；`transparent` 可透明         |

场景支持横竖比例。悬架和能量流是通用动画解释，运动不构成物理仿真、车型技术证据或真实测量。品牌 Logo 的标识与通用车身必须保持不同身份。

## 素材 rig

原始 SVG 优先按语义分组：body、front-wheel、rear-wheel、chassis、battery、annotations。普通静态 SVG 不会自动变成分层 rig。

可复用车辆 rig 的记录：

```json
{
  "body": "vehicle.sedan.body",
  "wheel": "part.wheel",
  "viewBox": [1000, 420],
  "wheelCenters": [
    [245, 325],
    [755, 325]
  ],
  "wheelRadius": 70
}
```

`body` 图层不包含车轮；轮心与半径使用同一坐标系。普通整图可显示、移动、缩放和淡入；车轮旋转与悬架动作需要明确部件与锚点。不要把一张整图旋转冒充车轮转动。用 `rig-create` 注册用户分层部件，具体命令见工具帮助。

```sh
node bin/auto-video.mjs rig-create --id "vehicle.my-car.rig" --name "我的车型分层" --body "vehicle.my-car.body" --wheel "part.my-wheel" --front "245,325" --rear "755,325" --radius 70
```

锚点以 1000×420 的统一布局为准，车身图片在此布局中保持比例居中显示。新建 rig 记录依赖部件的版本。精确运动前检查轮心、半径和真实构图；一套锚点不能直接套所有车型。

## 导出

`motion-project` 创建独立配置，`render` 输出 MP4。透明输出创建时加 `--transparent`，渲染时也加 `--transparent --out <file.webm>`。透明视频使用 VP9 / yuva420p，实际下游是否支持需验证。`render --frame 60 --out <file.png>` 输出单帧。普通 MP4 不提供 alpha。

首批效果均为本地原创帧驱动代码；tsParticles 的 Ambient / Links / Meteors 为已检索参考，不作为最终渲染依赖。参考清单见 `sources.md`。新效果入库至少检查连续动作、任意 seek、一帧重渲染一致性、横竖适配、透明叠加及实际导出。
