# 工程二维对象组件 v1

用于汽车科技解释动画的通用SVG对象：分层表面、占据切片、桌子正面、机械制动器和悬架剖面。造型、材质和动作封装在公共层；车型名称、口播时点、档位、画中画和技术结论留给业务层。

本资源不是新剪辑Skill、Runtime插件或内部车型CAD。所有对象均为纯二维正视/俯视，不包含透视、三维场景或Three.js。金属、玻璃和木纹感来自平面渐变、轮廓、纹理与局部高光。

| API | 输入与职责 |
| --- | --- |
| `engineeringDefs(id)` | SVG材质和纹理定义，调用方传唯一ID前缀。 |
| `instrumentPanel` | 可选标尺网格和表面背景；几何单位为SVG像素。 |
| `occupancyCells` | 网格数组，0未知、1空闲、2占据；严格核对数组尺寸和状态。 |
| `tableElevation` | 正面桌板、桌腿和木纹；不表示真实车型可通过性。 |
| `brakeAssembly` | 制动盘正视图和独立轴向夹紧剖面、夹钳、电机及丝杆，`clampAmount`为0—1示意状态，秒数驱动盘转动。 |
| `damperSection` | 活塞、杆、弹簧与轮心，`travel`为−1—1示意状态；不是物理仿真或控制接口。 |

函数返回SVG片段，由宿主建立唯一总时钟。位置/尺寸单位是SVG逻辑像素，时间单位是秒；不读取墙钟，不自播，不持有随机状态。相同输入及乱序seek得到相同结果。`id`由调用方隔离；公共对象不拥有素材、音轨或字幕时间轴。

```js
import {engineeringDefs,tableElevation,brakeAssembly} from './index.mjs';
const time=frame/fps;
const body=engineeringDefs('demo')+
  tableElevation({x:50,y:100,width:350,height:280,id:'demo'})+
  brakeAssembly({x:650,y:300,time,clampAmount:.6,id:'demo'});
```

`examples.mjs`是与品牌无关的第二套组合。L9 Livis的车辆/雷达继续使用独立的ADAS二维组件v1，芯片、计算活动和数据通路复用已有`compute-motion-2d/v1`；本库仅补充空间切片与机械对象，不再提供重复的计算组件。L9业务保存完整源快照及SHA256，不依赖远程组件运行。

从仓库根运行 `node common/components/engineering-motion-2d/v1/check.mjs`，检查错误输入、乱序seek和9个横竖版光栅状态；`node common/components/engineering-motion-2d/v1/render.mjs --out /absolute/path/demo.mp4` 导出4秒静音组件组合。实际动作与完整影片还需查看连续预览。API版本固定为1.0.0，改变状态含义时另开版本，旧项目继续使用本地快照。

2026-11-10实际验证：3种错误输入、乱序seek一致性、9个横竖版光栅状态通过；4秒/120帧中性组合已编码并完整解码，实际预览见L9 Livis V3交付目录。制动片沿转子厚度方向夹紧，正视图中的钳体保持固定；剖面间隙为可见性放大，不是实际行程。
