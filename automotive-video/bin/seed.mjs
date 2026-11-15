import fs from "node:fs";
import path from "node:path";
import * as icons from "simple-icons";
import { LIBRARY, hashFile, writeJson } from "../src/library.mjs";

const assets = [];
const wrap = (body, w = 1000, h = 420) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" fill="none">${body}</svg>`;
const wheel = (cx = 100, cy = 100, r = 84) =>
  `<g id="wheel"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#111b25" stroke="#93a7b7" stroke-width="5"/><circle cx="${cx}" cy="${cy}" r="${r * 0.69}" fill="#24394a" stroke="#e1eced" stroke-width="4"/>${Array.from({ length: 8 }, (_, i) => `<path d="M${cx} ${cy - 12} L${cx + 14} ${cy - r * 0.59} L${cx - 7} ${cy - r * 0.62} Z" fill="#bfced4" transform="rotate(${i * 45} ${cx} ${cy})"/>`).join("")}<circle cx="${cx}" cy="${cy}" r="16" fill="#0c1925" stroke="#c8f76b" stroke-width="4"/></g>`;
const body = (suv = false) =>
  `<g id="body"><path d="M100 297 L118 239 Q129 215 210 204 L${suv ? "292 112 Q305 96 350 96 L669 99 Q707 103 751 164" : "303 149 Q325 127 388 126 L596 126 Q634 127 707 190"} L855 212 Q901 222 910 258 L924 296 L906 328 L830 328 Q825 253 755 253 Q681 253 675 328 L325 328 Q319 253 245 253 Q173 253 169 328 L108 328 Z" fill="#294354" stroke="#c5d4dc" stroke-width="4"/><path d="M267 202 L326 ${suv ? 128 : 156} L${suv ? "657 127 L715 193" : "586 152 Q615 151 671 198"} Z" fill="#0b1d2d" stroke="#80aebf" stroke-width="3"/><path d="M458 149 L458 199 M684 214 L684 260 M363 216 L363 305 M375 306 L661 306" stroke="#84a8b4" stroke-width="3"/><path d="M128 246 L181 242 M861 241 L901 252" stroke="#c8f76b" stroke-width="10" stroke-linecap="round"/><path d="M483 223 H518 M701 228 H728" stroke="#d7e6e6" stroke-width="5" stroke-linecap="round"/><path d="M117 323 H168 M829 324 H910" stroke="#0b1722" stroke-width="13"/></g>`;
function add(id, name, category, svg, tags, extra = {}) {
  const file = `assets/${id}.svg`;
  const dest = path.join(LIBRARY, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, svg);
  const view = svg
    .match(/viewBox="([^"]+)/)[1]
    .split(" ")
    .map(Number);
  assets.push({
    id,
    name,
    version: "1.0.0",
    kind: "svg",
    category,
    file,
    sha256: hashFile(dest),
    width: view[2],
    height: view[3],
    tags,
    representation: "schematic",
    brand: "",
    model: "",
    view: "side",
    capabilities: ["display", "translate", "scale", "fade"],
    colorPolicy: "preserve",
    source: {
      type: "original",
      usage: "project-original",
      description:
        "为汽车科技二维解释绘制的通用示意；不代表具体品牌、车型或结构尺寸",
    },
    ...extra,
  });
}
add(
  "part.wheel",
  "八辐车轮",
  "parts",
  wrap(wheel(), 200, 200),
  ["车轮", "轮胎", "轮毂", "旋转", "wheel"],
  { anchors: { center: [100, 100] }, capabilities: ["display", "rotate"] },
);
for (const [type, label, suv] of [
  ["sedan", "轿车", false],
  ["suv", "SUV", true],
]) {
  add(
    `vehicle.${type}.body`,
    `通用${label}车身分层`,
    "rig-parts",
    wrap(body(suv)),
    ["车身", "分层", type],
  );
  add(
    `vehicle.${type}.side`,
    `通用${label}侧视`,
    "vehicles",
    wrap(
      body(suv) +
        `<g transform="translate(175 255) scale(.7)">${wheel()}</g><g transform="translate(685 255) scale(.7)">${wheel()}</g>`,
    ),
    ["汽车", "整车", "侧视", type, label],
    {
      rig: {
        body: `vehicle.${type}.body`,
        wheel: "part.wheel",
        viewBox: [1000, 420],
        wheelCenters: [
          [245, 325],
          [755, 325],
        ],
        wheelRadius: 70,
      },
      capabilities: ["display", "drive", "suspension", "wheel-rotate"],
    },
  );
}
add(
  "part.spring",
  "悬架弹簧",
  "parts",
  wrap(
    '<path d="M90 20 V45 L40 70 L140 110 L40 150 L140 190 L40 230 L140 270 L40 310 L140 350 L90 375 V400" stroke="#c8f76b" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>',
    180,
    420,
  ),
  ["悬架", "弹簧", "减振", "spring"],
  {
    anchors: { top: [90, 20], bottom: [90, 400] },
    capabilities: ["display", "compress"],
  },
);
add(
  "part.battery",
  "电池包俯视示意",
  "parts",
  wrap(
    `<rect x="28" y="24" width="544" height="272" rx="24" fill="#18363c" stroke="#c8f76b" stroke-width="5"/>${Array.from({ length: 12 }, (_, i) => `<rect x="${52 + (i % 6) * 84}" y="${48 + Math.floor(i / 6) * 120}" width="69" height="98" rx="8" fill="#31594a" stroke="#8aa981" stroke-width="2"/>`).join("")}<path d="M274 129 L314 94 L300 145 H335 L282 204 L295 154 H270 Z" fill="#c8f76b"/>`,
    600,
    320,
  ),
  ["电池", "电池包", "电驱", "能量", "battery"],
  { view: "top" },
);
add(
  "part.motor",
  "电机示意",
  "parts",
  wrap(
    '<rect x="60" y="55" width="250" height="190" rx="70" fill="#24495b" stroke="#8ddcef" stroke-width="5"/><rect x="15" y="110" width="70" height="80" rx="8" fill="#25394d" stroke="#a9c2ce" stroke-width="4"/><rect x="288" y="123" width="95" height="54" rx="9" fill="#7c9aa8"/><path d="M135 85 V215 M170 80 V220 M205 82 V218 M240 90 V210" stroke="#59c8df" stroke-width="8"/>',
    400,
    300,
  ),
  ["电机", "电驱", "动力", "motor"],
);
add(
  "part.chassis.top",
  "通用电驱底盘俯视",
  "parts",
  wrap(
    '<path d="M230 55 H770 L824 120 V1050 L770 1130 H230 L176 1050 V120 Z" fill="#132a36" stroke="#668b9c" stroke-width="7"/><path d="M240 170 H760 M240 1010 H760 M255 180 V1000 M745 180 V1000" stroke="#9ab4bf" stroke-width="12"/><rect x="290" y="300" width="420" height="520" rx="26" fill="#244c44" stroke="#c8f76b" stroke-width="5"/><path d="M310 380 H690 M310 460 H690 M310 540 H690 M310 620 H690 M310 700 H690" stroke="#63977d" stroke-width="3"/><rect x="330" y="160" width="340" height="100" rx="28" fill="#376276"/><rect x="330" y="900" width="340" height="100" rx="28" fill="#376276"/>',
    1000,
    1200,
  ),
  ["底盘", "电驱", "电池", "俯视", "chassis"],
  { view: "top" },
);
add(
  "vehicle.top",
  "通用车辆俯视",
  "vehicles",
  wrap(
    '<rect x="75" y="40" width="250" height="630" rx="110" fill="#294354" stroke="#c2d5df" stroke-width="5"/><path d="M105 220 Q200 165 295 220 L280 330 H120 Z M120 480 H280 L294 560 Q200 600 106 560 Z" fill="#0b1e2c" stroke="#7eb3c6" stroke-width="3"/><rect x="115" y="350" width="170" height="100" rx="30" fill="#35566b"/>',
    400,
    720,
  ),
  ["汽车", "俯视", "感知", "扫描", "车辆"],
  { view: "top" },
);
add(
  "part.sensor",
  "传感器示意",
  "parts",
  wrap(
    '<path d="M70 155 L104 70 H296 L330 155 V230 H70 Z" fill="#25465b" stroke="#8ad4df" stroke-width="5"/><rect x="115" y="100" width="170" height="85" rx="36" fill="#0b2130"/><circle cx="200" cy="142" r="27" fill="#163f4a" stroke="#c8f76b" stroke-width="5"/><circle cx="200" cy="142" r="10" fill="#c8f76b"/>',
    400,
    300,
  ),
  ["传感器", "雷达", "摄像头", "感知", "sensor"],
);
add(
  "vehicle.documentary.top",
  "工程纪录片 · 俯视车辆",
  "vehicles",
  wrap(
    '<defs><linearGradient id="body" x2="1" y2="1"><stop stop-color="#eff8fa"/><stop offset=".55" stop-color="#aabcc5"/><stop offset="1" stop-color="#657b87"/></linearGradient></defs><path d="M17 81H34V138H17ZM146 81H163V138H146ZM17 241H34V306H17ZM146 241H163V306H146Z" fill="#10191e" stroke="#748995" stroke-width="3"/><path d="M33 110 14 119 10 133 32 132M147 110 166 119 170 133 148 132" fill="#91a8b4" stroke="#d4e3e8" stroke-width="2"/><path d="M90 8C126 8 150 14 155 52L162 116 158 272 153 324C150 345 133 359 90 360 47 359 30 345 27 324L22 272 18 116 25 52C30 14 54 8 90 8Z" fill="url(#body)" stroke="#dcebf0" stroke-width="3"/><path d="M35 85Q90 58 145 85L137 127Q90 114 43 127Z M42 264Q90 276 138 264L145 310Q90 334 35 310Z" fill="#162934" stroke="#496674" stroke-width="3"/><path d="M34 130 46 140 45 249 34 262 28 223 28 167Z M146 130 134 140 135 249 146 262 152 223 152 167Z" fill="#20343e"/><path d="M51 140Q90 129 129 140L130 246Q90 256 50 246Z" fill="#b8cbd3" stroke="#728d9b" stroke-width="2"/><path d="M35 55 48 26M145 55 132 26M43 337Q90 350 137 337" fill="none" stroke="#526d7b" stroke-width="3" stroke-linecap="round"/><path d="M33 42 52 27M147 42 128 27" fill="none" stroke="#f4fcff" stroke-width="6" stroke-linecap="round"/><path d="M36 330 54 340M144 330 126 340" fill="none" stroke="#b9514c" stroke-width="6" stroke-linecap="round"/>',
    180,
    370,
  ),
  ["汽车", "俯视", "并线", "感知", "top"],
  { view: "top" },
);
add(
  "part.battery.documentary",
  "工程纪录片 · 电池包",
  "parts",
  wrap(
    `<rect x="5" y="5" width="290" height="150" rx="17" fill="#26343a" stroke="#91aab5" stroke-width="4"/><rect x="18" y="18" width="264" height="124" rx="10" fill="#15262e" stroke="#445f69" stroke-width="2"/>${Array.from({ length: 7 }, (_, column) => `<rect x="${26 + column * 36}" y="27" width="31" height="47" rx="4" fill="#365561" stroke="#6f96a2"/><rect x="${26 + column * 36}" y="86" width="31" height="47" rx="4" fill="#365561" stroke="#6f96a2"/>`).join("")}<path d="M124 79H176M150 69V89" stroke="#d5edf3" stroke-width="3" stroke-linecap="round"/>`,
    300,
    160,
  ),
  ["电池", "电驱", "电池包"],
  { view: "top" },
);
add(
  "part.wheel.documentary",
  "工程纪录片 · 俯视轮胎",
  "parts",
  wrap(
    `<rect x="3" y="3" width="58" height="122" rx="13" fill="#152129" stroke="#8ca0ad" stroke-width="4"/><path d="M20 13V115M44 13V115" stroke="#47616c" stroke-width="2"/>${Array.from({ length: 8 }, (_, row) => `<path d="M10 ${16 + row * 13}h11l11 6 11-6h11" stroke="#758c96" stroke-width="2" opacity=".7"/>`).join("")}`,
    64,
    128,
  ),
  ["车轮", "轮胎", "电驱", "俯视"],
  { view: "top" },
);
add(
  "part.chip",
  "计算芯片示意",
  "parts",
  wrap(
    `<rect x="80" y="80" width="240" height="240" rx="24" fill="#143249" stroke="#65d7ee" stroke-width="6"/><rect x="120" y="120" width="160" height="160" rx="12" fill="#244c56" stroke="#c8f76b" stroke-width="4"/>${Array.from({ length: 6 }, (_, i) => `<path d="M${110 + i * 36} 20 V75 M${110 + i * 36} 325 V380 M20 ${110 + i * 36} H75 M325 ${110 + i * 36} H380" stroke="#9bb8c6" stroke-width="10"/>`).join("")}`,
    400,
    400,
  ),
  ["芯片", "计算", "算力", "chip"],
);
add(
  "part.road",
  "起伏道路",
  "parts",
  wrap(
    '<path d="M0 180 H330 Q385 180 410 135 Q450 70 500 135 Q525 180 580 180 H1000 V250 H0 Z" fill="#243947"/><path d="M0 180 H330 Q385 180 410 135 Q450 70 500 135 Q525 180 580 180 H1000" stroke="#96aeb9" stroke-width="6"/>',
    1000,
    260,
  ),
  ["道路", "减速带", "路面", "起伏"],
);
for (const slug of [
  "byd",
  "bmw",
  "mercedesbenz",
  "volkswagen",
  "toyota",
  "tesla",
  "nio",
  "xiaomi",
  "huawei",
  "geely",
]) {
  const icon = Object.values(icons).find(
    (x) => x && typeof x === "object" && x.slug === slug,
  );
  if (!icon) continue;
  const chinese =
    {
      bmw: "宝马",
      volkswagen: "大众",
      toyota: "丰田",
      tesla: "特斯拉",
      xiaomi: "小米",
      huawei: "华为",
    }[slug] || icon.title;
  add(
    `logo.${slug}`,
    `${chinese} ${icon.title}`,
    "logos",
    icon.svg.replace("<svg ", '<svg fill="#' + icon.hex + '" '),
    [icon.title, chinese, slug, "品牌", "Logo", "标志"],
    {
      aliases: [chinese],
      brand: icon.title,
      view: "flat",
      representation: "brand-glyph",
      colorPolicy: "locked",
      source: {
        type: "simple-icons",
        url: icon.source,
        package: "simple-icons@16.36.0",
        license: icon.license || {
          type: "CC0-1.0 collection; trademark remains separate",
        },
        usage: "brand-identification",
        collection: "https://github.com/simple-icons/simple-icons",
      },
    },
  );
}
writeJson(path.join(LIBRARY, "index.json"), {
  schemaVersion: 1,
  version: "1.0.0",
  assets,
});
console.log(
  JSON.stringify(
    {
      seeded: assets.length,
      logos: assets.filter((a) => a.category === "logos").map((a) => a.name),
    },
    null,
    2,
  ),
);
