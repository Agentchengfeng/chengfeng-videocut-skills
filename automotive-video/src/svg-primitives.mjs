export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const ease = (t) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
export const image = (src, x, y, w, h, extra = "") =>
  src
    ? `<image href="${esc(src)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" ${extra}/>`
    : "";
export const label = (
  text,
  x,
  y,
  size = 25,
  color = "#edf4f7",
  anchor = "start",
) =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-family="PingFang SC,Noto Sans CJK SC,sans-serif" text-anchor="${anchor}">${esc(text)}</text>`;
