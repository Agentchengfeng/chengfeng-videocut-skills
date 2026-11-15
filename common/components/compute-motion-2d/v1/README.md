# Common · 计算类二维组件 v1

用于科技口播中的计算原理说明。纯SVG组件可独立导出，也有薄React适配层供Remotion组合；宿主传入`time=frame/fps`，不创建第二条时间轴。本库不改Plugin/Runtime，不替换原生工程审核或导出合同。

首个实际业务消费者为理想M100 V4的21段正文；另有不引用车型、芯片结论或字幕cue的四段独立演示。车辆、道路和轨迹继续复用已有`adas-motion-2d/v1`，没有复制出另一套车辆规范。公共计算组件也不依赖那一期的片长、字幕、小窗位置、品牌图片或评级。

| 层级 | 资源 | 可复用内容 |
|---|---|---|
| 对象 | `cpu`、`gpu` | 带引脚/基板的正面封装；CPU大单元/共享缓存、GPU并行阵列；活动负载与等待状态 |
| 对象 | `chipPackage`、`computeTile` | 平面芯片、计算单元；名称、颜色、尺寸、活动状态 |
| 对象 | `memoryBank`、`cacheBuffer` | 存储分组、缓存槽位与队列填充 |
| 对象 | `cameraSensor`、`modelNetwork` | 镜头/传感器、特征节点与层间流动 |
| 连接 | `dataBus`、`pointAlong` | 沿折线路径按真实弧长移动的信号、方向箭头；正反向、排队前后状态 |
| 组合 | `memoryWall` | 存储＋缓存＋CPU/GPU＋数据通路，支持等待状态 |
| 组合 | `dataflowFabric` | 编译规划＋可变行列计算单元＋内部传递＋结果回用 |
| 画面基础 | `defs`、`panel`、`backdrop`、`svgDoc` | 统一色板、层次、描边、安静网格、纹理和定义命名空间 |
| React | `remotion.tsx` | 同一SVG实现的Cpu/Gpu/MemoryWall等React包装；没有重复维护一套动画 |

矩阵格数、核心数量、引脚和布局均为通用解释，不是实际芯片核数、内部拓扑或性能数据。负载/填充只是0–1视觉状态，不标TOPS、容量、带宽或帧率。具体事实、口播触发点、官方图片和使用边界由业务层提供。

## 接口约定

- 几何为SVG逻辑像素。对象`x/y`为中心，面板/背景和组合`x/y`为左上；组合宽度等比缩放整个逻辑构图。对象尺寸可配置，缩小的计算块省略小字。
- 时间为秒，须为有限数；由宿主帧派生。没有墙钟、随机数、CSS动画、自播、累加器或seek顺序状态。负时间的循环相位已归一化。
- `load`、`fill`、`active`、`reuse`、组合`stalled`为0–1状态；CPU/GPU的`stalled`为布尔值。不把不同参数里的同名视觉量当作真实性能测量。
- 折线须有至少两个有限二维点，允许重复点，但总长度必须非零；矩阵行列、数据包数量有范围检查。非法时间、负尺寸、无效折线和不支持的网格抛错。
- 使用同一`id`把对象与`defs(id)`绑定。在同一SVG内放多个独立画面时，分别传不同的合法命名空间。
- `svgDoc(...,{transparent:true})`可输出alpha。普通H.264不保存透明通道；宿主自行选择透明视频编码。

```js
import {svgDoc,memoryWall,dataflowFabric} from './index.mjs';
const time=frame/fps;
const svg=svgDoc(memoryWall({x:40,y:300,width:1000,time,stalled:.8}),
  {width:1080,height:1440});
// 同一对象层组合另一种原理：
const fabric=svgDoc(dataflowFabric({x:40,y:300,width:1000,time,
  columns:2,rows:2,reuse:1,label:'任务规划 · 数据就绪后计算'}),
  {width:1080,height:1440});
```

Remotion中将本版目录放入已有工程后引用`remotion.tsx`，由宿主解析现有React/Remotion依赖，无须再建平台或升级Runtime。跨仓库直接引用时也须由宿主提供React解析；本轮没有改动其他工程依赖：

```tsx
import {useCurrentFrame,useVideoConfig} from 'remotion';
import {ComputeCanvas,Cpu,Gpu,DataBus} from './remotion';
export const Diagram=()=>{
  const frame=useCurrentFrame();
  const {fps}=useVideoConfig();
  const time=frame/fps;
  return <ComputeCanvas>
    <Cpu x={290} y={650} time={time}/>
    <Gpu x={790} y={650} time={time}/>
    <DataBus points={[[430,650],[650,650]]} time={time}/>
  </ComputeCanvas>;
};
```

`ComputeCanvas`的`id`与子对象一致。包装层只把同一SVG片段交给React，测试包含实际React静态渲染与纯SVG三帧像素相同；这不等于已在某个原生Runtime工程中审核。

## 独立演示与验证

```bash
node common/components/compute-motion-2d/v1/check.mjs
node common/components/compute-motion-2d/v1/check-raster.mjs
node common/components/compute-motion-2d/v1/render.mjs --out /absolute/path/common-demo.mp4
# 横屏或指定已生成的字体子集：
node common/components/compute-motion-2d/v1/render.mjs --out /absolute/path/common-wide.mp4 --width 1920 --height 1080 --fonts /absolute/path/fonts
```

`examples.mjs`包含CPU/GPU、内存墙、2×2数据流、相机到模型四段，16秒/60fps。`index.html`是被动资源，只接收`window.seekTo(seconds)`、`window.ready`或`videocut:seek`，不提供另一个播放器。需要HTTP访问模块依赖时使用已有静态服务。

`check.mjs`验证路径弧长/反向/重复点、错误输入、命名空间、两个组合与乱序seek；`check-raster.mjs`覆盖横竖版、透明、不同状态和真实光栅化。仍须实际看导出视频；结构测试不代替视觉观察。

本轮实际媒体、截图和记录保存在`videostyle_1/理想M100介绍/output/v4/`及`assembly-v4/`。本版无外部图像/字体文件授权依赖，字体沿用调用方本机已有Noto字体；通用几何为原创。采用情况目前为M100＋独立演示，不声称已有其他外部项目采用。

版本固定1.0.0。业务保存原样快照与SHA-256，历史版本不随Common编辑自动变化；改变接口或动作含义时开新版本。需退出时保留本地快照即可，运行不依赖远程服务。
