import React from "react";
import { Composition, registerRoot } from "remotion";
import { AutoVideo } from "./Composition.jsx";
registerRoot(() => (
  <Composition
    id="AutoVideo"
    component={AutoVideo}
    width={1280}
    height={720}
    fps={30}
    durationInFrames={180}
    defaultProps={{
      project: {
        width: 1280,
        height: 720,
        fps: 30,
        duration: 6,
        clips: [
          {
            id: "ambient-preview",
            kind: "scene",
            type: "motion",
            motion: "ambient",
            start: 0,
            end: 6,
            params: { density: 100, intensity: 0.8 },
          },
        ],
        captions: [],
      },
      assets: {},
    }}
    calculateMetadata={({ props }) => ({
      width: props.project.width,
      height: props.project.height,
      fps: props.project.fps,
      durationInFrames: Math.round(props.project.duration * props.project.fps),
    })}
  />
));
