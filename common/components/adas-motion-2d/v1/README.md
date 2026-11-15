# ADAS 二维动效公共组件 v1

首个业务消费者为Momenta R7正文动画，另有不依赖品牌或本期字幕的`examples.mjs`。本库是本地SVG绘图资源，不是新的剪辑Skill、Product工程、审核播放器或已注册Runtime预设；原`auto-video list`中的v1预设保持原义。

## 可复用层

| 公共组件 | 职责及主要参数 |
| --- | --- |
| `vehicle`、`rider` | 通用正俯视车辆/骑行者；位置、朝向、比例、车型轮廓、颜色、车轮转向、灯光和时间。不是具体品牌/车型建模。 |
| `roadWorld`、`worldFrame` | 道路、车道线、路缘、路侧物体、停车边界；urban/construction/narrow和画面尺寸。等比缩放模型，不因横竖版拉长车辆。 |
| `sensorField`、`trackingBox` | 扫描、覆盖区域、目标跟踪；共享道路坐标，随目标连续移动。覆盖范围纯示意。 |
| `trajectory`、`pose` | 三次Bezier候选线、带状路径、动态箭头、对象位置和切线朝向。De Casteljau子曲线揭示兼容浏览器和Resvg。 |
| `modelCore` | 平面模型核心、特征格、连线、动态信号。格子和连线是视觉隐喻，不代表真实网络参数、层数或内部拓扑。 |
| `feedbackCircuit`、`phaseRail` | 连续回路、流动方向和语义阶段；具体奖励含义、动作选择、口播触发点由业务提供。 |

Momenta的R6/R7差别、时序预训练、动作条件推演、三次强化学习示意、窄路借位和技术评级留在业务适配层。公共层不引用Momenta、某个字幕cue、评级结论或视频片长。没有把某一期的档位、画中画位置或车型写成全局默认。

## 调用契约

```js
import {svgDoc,roadWorld,worldFrame,vehicle,trajectory,pose} from './index.mjs';
const time=frame/fps; // 秒，只由宿主传入
const points=[[650,790],[650,650],[540,560],[540,420]];
const car=pose(points,.4);
const world=roadWorld({time})+
  trajectory({points,time,color:'#65d9aa'})+
  vehicle({...car,kind:'suv',time});
const svg=svgDoc(worldFrame('road',54,650,972,875,world),
  {width:1080,height:1600,namespace:'my-episode'});
```

- 位置/尺寸为SVG逻辑像素；`worldFrame`横向1000逻辑单位、纵向由画幅推导；模型等比缩放。车辆朝上为0度，顺时针为正；`steering`是二维前轮转角。
- 时间用秒，不读取墙钟、不自播、不使用随机状态或CSS动画。相同输入、乱序seek的输出一致。完整SVG通过`svgDoc`提供依赖定义并隔离ID。
- 不支持的车辆kind/paint、道路mode和非法轨迹控制点抛错；不静默替换成另一个真实型号。
- 曲线绘制和朝向计算不等于路径已满足曲率、碰撞或交通规则约束；这些业务语义及示意场景的空间边界由调用方负责，不把通用绘图函数冒充驾驶规划器。
- `svgDoc`可输出透明背景，透明视频须使用合适编码；普通H.264不能保留alpha。宿主负责人像/字幕安全区域和原声音轨，公共库不建立第二个时间轴。
- SVG采用本机Noto Sans CJK SC/PingFang后备字体；示例脚本复用工具包已有Resvg、FFmpeg和已装字体，不安装软件。

## 演示与检查

```bash
node common/components/adas-motion-2d/v1/check.mjs
node common/components/adas-motion-2d/v1/render.mjs --out /path/components-demo.mp4
node common/components/adas-motion-2d/v1/render.mjs --out /path/components-demo-wide.mp4 --width 1920 --height 1080
```

`index.html`是被动资源：`window.seekTo(seconds)`、`window.ready`和`videocut:seek`驱动，无自制播放器或自动播放。静音组件演示有车辆、扫描、轨迹、反馈四段；不表示真实车测。

`check.mjs`检查几何端点、模型比例、错误输入、ID、乱序seek及横竖版18个光栅状态；它不替代实际图像与连续动画检查。独立示例与业务调用共同验证接口，未声称已有其他外部项目采用。本轮输出的实际验证与人工画面记录见Momenta项目的`motion-v6/`。

版本固定为1.0.0；业务可保存原样快照并记录SHA256。新增不同含义的模型/时间规则另开版本，不覆盖历史成片；要退出时保留本地模块即可，不依赖远程运行服务。
