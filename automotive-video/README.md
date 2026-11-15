# 汽车科技视频工具包

面向已经粗剪的汽车口播：AI 负责选素材、字幕校对、镜头组织、二维动画与画面合成，音效在画面确定后最后处理。

## 直接使用

三个 Skill 已通过 `npm run install:skills` 安装后，可在新会话中使用：

- `$auto-video-edit`：给出粗剪视频，完成精剪包装。
- `$auto-video-assets`：整理自己的 SVG、图片和视频，或按主题搜集素材。
- `$auto-video-motion`：复用二维粒子、背景、转场和汽车解释场景。

典型请求：

> 使用汽车科技精剪 Skills，处理这条粗剪视频。口播稿在同目录，按已有风格自动搜集画面、做好字幕和二维动画，音效最后加。

> 把这个文件夹里的车型 SVG、Logo、底盘和车轮图片整理进汽车素材库，后面优先复用。

> 用组件库做一个冰蓝色粒子背景，强度低一点，给文字留清楚空间。

## 打开组件目录

双击 `打开组件库.command`，或在本目录运行：

```sh
npm run catalog
```

浏览 http://127.0.0.1:3211 。目录页有素材检索、场景预览、粒子参数、播放/拖动和配置复制。服务只绑定本机。Remotion 源码预览：`npm run studio`。

## 加入自己的素材

```sh
node bin/auto-video.mjs batch-import "/绝对路径/素材目录"
node bin/auto-video.mjs search "车轮"
node bin/auto-video.mjs validate
```

普通图片可直接展示，独立动作需要分层部件；通用示意和真实车型分别标记。资料卡、选段和原始下载见 [素材规则](references/asset-sourcing.md)。组件参数与 rig 见 [组件合同](references/components.md)。

## 粗剪视频项目

```sh
node bin/auto-video.mjs init --video "/绝对路径/粗剪.mp4" --srt "/绝对路径/同步字幕.srt" --out "projects/本期"
node bin/auto-video.mjs validate --project "projects/本期/project.json"
node bin/auto-video.mjs render "projects/本期/project.json" --out "projects/本期/整片预览.mp4"
```

AI 根据实际口播和素材在 project.json 中编排 clips；CLI 提供可靠执行，不包含凭空推断技术事实或一键随机配片算法。没有 SRT 可以用已配置的云端转录，详见 [项目合同](references/project-contract.md)。缺凭证不影响素材库和独立动画使用。

## 示例与检查

```sh
npm run demo
node bin/auto-video.mjs render examples/documentary/project.json --out review/four-scenes.mp4
node bin/auto-video.mjs render examples/documentary/portrait/project.json --out review/cut-in-portrait.mp4
npm test
```

新版组件库默认打开「相邻车辆并线」。四类工程纪录片场景提供七个镜头预设。选定预设和素材后复制配置，再填入剪辑片段的时间。完整预设和素材位见 [组件合同](references/components.md)。

`library/` 保存内置素材与用户入库文件；`projects/` 保存实际项目；`assets.lock.json` 和项目快照保证公共库更新后旧项目仍可重渲染。相同 ID/版本的文件不会被静默替换。

本目录独立于官方 chengfeng 插件安装快照。现有插件保持自己的发行与来源合同；无需修改官方缓存、Runtime 或固定七入口测试。
