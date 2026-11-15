import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
} from "remotion";
import { Video } from "@remotion/media";
import { renderSceneSvg, clamp } from "./visuals.mjs";
import { captionSafeBottom } from "./engineering-drawing.mjs";

const svgUrl = (s) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
function Clip({ clip, assets, safeBottom = 0 }) {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const duration = clip.end - clip.start;
  const frames = Math.round(duration * fps);
  const edge = Math.max(
    1,
    Math.min(Math.round(fps * 0.22), Math.floor(frames / 3)),
  );
  const fade =
    (clip.transition === "fade" ? clamp(f / edge) : 1) *
    (clip.exitTransition === "fade" ? clamp((frames - 1 - f) / edge) : 1);
  const wipe = clip.transition === "wipe" ? clamp(f / Math.max(1, edge)) : 1;
  const style = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
  };
  let content;
  if (clip.kind === "scene") {
    const svg = renderSceneSvg(
      { ...clip, duration, safeBottom },
      f,
      fps,
      width,
      height,
      assets,
    );
    content = (
      <img src={svgUrl(svg)} style={{ ...style, objectFit: "contain" }} />
    );
  } else if (clip.kind === "video")
    content = (
      <Video
        src={staticFile(assets[clip.assetId].data)}
        trimBefore={Math.round(clip.sourceIn * fps)}
        durationInFrames={frames}
        muted
        premountFor={fps}
        objectFit={clip.fit || "cover"}
        style={style}
      />
    );
  else
    content = (
      <img
        src={assets[clip.assetId].data}
        style={{
          ...style,
          ...(clip.fit !== "cover"
            ? {
                left: "8%",
                top: "6%",
                width: "84%",
                height: `${88 - safeBottom * 100}%`,
              }
            : {}),
          objectFit: clip.fit || "contain",
        }}
      />
    );
  return (
    <AbsoluteFill
      style={{
        opacity: fade,
        clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)`,
        background:
          clip.kind === "scene" && clip.transparent
            ? "transparent"
            : clip.kind === "scene"
              ? "transparent"
              : clip.background || "#080f18",
      }}
    >
      {content}
    </AbsoluteFill>
  );
}
export function AutoVideo({ project, assets = {} }) {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const time = f / fps;
  const caption = project.captions?.find(
    (c) => time >= c.start && time < c.end,
  );
  const cs = project.captionStyle || {};
  const hasCaptions = Boolean(project.captions?.length);
  const presetSafeBottom = hasCaptions
    ? captionSafeBottom(width, height, cs)
    : 0;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: project.transparent ? "transparent" : "#080f18",
      }}
    >
      {project.master ? (
        <Video
          src={staticFile(project.master.file)}
          objectFit={project.master.fit || "contain"}
          premountFor={fps}
          style={{ width: "100%", height: "100%" }}
        />
      ) : null}
      {project.clips.map((c) => (
        <Sequence
          key={c.id}
          name={c.id}
          from={Math.round(c.start * fps)}
          durationInFrames={Math.max(1, Math.round((c.end - c.start) * fps))}
          premountFor={fps}
        >
          <Clip
            clip={c}
            assets={assets}
            safeBottom={c.preset ? presetSafeBottom : hasCaptions ? 0.2 : 0}
          />
        </Sequence>
      ))}
      {caption ? (
        <div
          style={{
            position: "absolute",
            left: `${(100 - (cs.maxWidth || 86)) / 2}%`,
            width: `${cs.maxWidth || 86}%`,
            bottom: `${cs.bottom ?? 8}%`,
            textAlign: "center",
            fontFamily: "PingFang SC,Noto Sans CJK SC,sans-serif",
            fontSize: (width * (cs.fontSize || 4.1)) / 100,
            fontWeight: 600,
            color: "#fff",
            lineHeight: 1.5,
            textShadow: "0 2px 5px #000, 2px 0 2px #000, -2px 0 2px #000",
            whiteSpace: "pre-wrap",
          }}
        >
          {caption.text}
        </div>
      ) : null}
    </AbsoluteFill>
  );
}
