# V2 配置与图片

保留 schemaVersion: 1。新增 styleVersion: 2 选择 V2；缺省或为 1 时按原 V1 画面渲染，忽略 V2 内容字段。原 render(time, config)、videocut:seek 与渲染命令保持兼容。公共配置仅提供空车型槽及空方案表，各期另存自己的配置。

| 字段 | 内容 |
|---|---|
| openingSlots | 恰好四项，每项 label 为车型名称，image 为相对本次 config.json 的 PNG/JPEG/WebP 路径，或明确的 null 空槽 |
| tierEntries | 已讲方案数组，每项为 name、tier（S/A/B/C/D）、position（upper/middle/lower） |
| tierPresentation | chips为芯片图片版，labels为原文字标签版；未指定时保留文字版 |
| tierEntries[].image / chipCount | 可选的相对芯片图片路径与1或2颗；单、双颗共享同一型号图，仍保留短名称 |
| currentEpisode | name、revealed；revealed=false 时不在档内出现名称或占位；true 时还需 tier、position |
| captions | false 关闭模板字幕，交给实际剪辑工程显示 |
| cues | 原十句的连续起止时间，单位秒，覆盖整个 duration |

同档同位置最多两个名称，按数组顺序左右并排；上中下分别对齐该行的上、中、下区域。超出容量时报错，询问用户调整位置或精简内容，不删除名称。名称最多24字符，标签字体按可用宽度调整，实际出图仍须核对可读性。

芯片图片版按内容增加有方案行的高度：中部展示留192px，上／下沿展示留272px，空行120px。总表高不超过1000px；过密时报告错误，需调整展示范围，不压成看不清的小图。双颗显示两枚独立图片，不用“×2”文字代替。currentEpisode揭晓时也支持image、chipCount；未揭晓不读取其图片。

内置图片为chips/orin.png、chips/thor.png、chips/turing.png；复制模板assets后可直接引用。外部实例可复制所选图到本期images目录，再填写images/orin.png等。图片加载按路径去重，浏览器和Node读取相同文件。来源与处理见assets/chips/sources.json；原始图版权归各厂商。

示例（仅示范配置写法，不是默认评级）：

```json
{
  "styleVersion": 2,
  "openingSlots": [
    {"label":"车型 01","image":null},
    {"label":"车型 02","image":null},
    {"label":"车型 03","image":null},
    {"label":"车型 04","image":null}
  ],
  "tierEntries": [{"name":"用户指定方案","tier":"B","position":"middle"}],
  "currentEpisode": {"name":"本期方案","revealed":false,"tier":null,"position":null}
}
```

图片只用相对本次配置目录的本地路径，例如 images/car-01.jpg，不填绝对路径或远端 URL。Node 从 config 所在目录读取，浏览器从 config URL 解析；两者通过 prepareImages(config, readImage) 获得相同的嵌入图片，原 config 不会被修改。缺文件或无效图片不能作为成功交付。图片使用居中裁切填满槽的图片区，底部保留车型名称；需要其他裁切时先准备好相应图片。

公共模板浏览器入口与 scene.js 默认读取同目录 config.json；每期复制整个 assets 目录，替换其中 config 并保存图片即可。标准渲染命令可直接使用外部实例 config，无须把它复制回公共目录。
