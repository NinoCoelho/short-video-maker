import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  Audio,
  OffthreadVideo,
  Img,
} from "remotion";
import { z } from "zod";
// Use local font instead of Google Fonts to avoid timeout issues
// import { loadFont } from "@remotion/google-fonts/BarlowCondensed";

import {
  calculateVolume,
  createCaptionPages,
  shortVideoSchema,
} from "../utils";
import { getOverlayUrl } from "./src/remotion/getOverlayUrl";

// Use local font instead of Google Fonts
const fontFamily = "'BenzGrotesk', sans-serif";

export const PortraitVideo: React.FC<z.infer<typeof shortVideoSchema>> = ({
  scenes,
  music,
  config,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const captionBackgroundColor = config.captionBackgroundColor ?? "blue";
  const captionTextColor = config.captionTextColor ?? "#ffffff";

  const activeStyle = {
    backgroundColor: captionBackgroundColor,
    color: captionTextColor,
    padding: "10px",
    marginLeft: "-10px",
    marginRight: "-10px",
    borderRadius: "10px",
  };

  const captionPosition = config.captionPosition ?? "center";
  let captionStyle = {};
  if (captionPosition === "top") {
    captionStyle = { top: 100 };
  }
  if (captionPosition === "center") {
    captionStyle = { top: "50%", transform: "translateY(-50%)" };
  }
  if (captionPosition === "bottom") {
    captionStyle = { bottom: 100 };
  }

  const [musicVolume, musicMuted] = calculateVolume(config.musicVolume);

  // Calculate total duration including automatic 3-second fade out
  const fadeOutDuration = 3; // 3 segundos de fade out
  const narrationDuration = scenes.reduce((acc, curr) => acc + curr.audio.duration, 0);
  const totalDurationInFrames = Math.round((narrationDuration + fadeOutDuration) * fps);
  
  // Calculate fade out timing
  const fadeOutStartFrame = Math.round(narrationDuration * fps);
  const fadeOutEndFrame = totalDurationInFrames;

  // Music volume with fade out
  const getMusicVolume = (currentFrame) => {
    if (currentFrame >= fadeOutStartFrame && currentFrame < fadeOutEndFrame) {
      // Fade out linear de 100% para 0% nos últimos 3 segundos
      const fadeProgress = (currentFrame - fadeOutStartFrame) / (fadeOutEndFrame - fadeOutStartFrame);
      return musicVolume * (1 - fadeProgress);
    }
    return musicVolume;
  };

  // Video opacity with fade out
  const getVideoOpacity = (currentFrame) => {
    if (currentFrame >= fadeOutStartFrame && currentFrame < fadeOutEndFrame) {
      // Fade out linear de 100% para 0% nos últimos 3 segundos
      const fadeProgress = (currentFrame - fadeOutStartFrame) / (fadeOutEndFrame - fadeOutStartFrame);
      return 1 - fadeProgress;
    }
    return 1;
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "white" }}>
      <Audio
        loop
        src={music.url}
        startFrom={music.start * fps}
        volume={() => getMusicVolume(frame)}
        muted={musicMuted}
      />

      {config?.overlay && (
        <Img
          src={getOverlayUrl(config.overlay, 'remotion')}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 1,
            opacity: getVideoOpacity(frame),
          }}
        />
      )}

      {scenes.map((scene, i) => {
        const { captions, audio, video } = scene;
        const pages = createCaptionPages({
          captions,
          lineMaxLength: 20,
          lineCount: 1,
          maxDistanceMs: 1000,
        });

        // Calculate the start and end time of the scene
        const startFrame =
          scenes.slice(0, i).reduce((acc, curr) => {
            return acc + curr.audio.duration;
          }, 0) * fps;
        let durationInFrames = scene.audio.duration * fps;
        if (config.paddingBack && i === scenes.length - 1) {
          durationInFrames += (config.paddingBack / 1000) * fps;
        }

        return (
          <Sequence
            from={startFrame}
            durationInFrames={durationInFrames}
            key={`scene-${i}`}
          >
            <OffthreadVideo src={video} muted />
            <Audio src={audio.url} />
            {pages.map((page, j) => {
              const pageStartMs = page.startMs ?? 0;
              const pageEndMs = page.endMs ?? 0;
              
              // CORRIGIDO: Usar frames diretamente em vez de milissegundos
              let fromFrame = Math.round((pageStartMs / 1000) * fps);
              
              if (i === 0) {
                // Primeira cena: legendas começam no frame 2 (após hook)
                fromFrame = Math.max(fromFrame, 2);
              } else {
                // Demais cenas: legendas começam no frame 1 da cena
                fromFrame = Math.max(fromFrame, 1);
              }
              
              // Duração em frames baseada no timing original da página
              const pageDurationMs = Math.max(pageEndMs - pageStartMs, 0.001);
              const durationFrames = Math.max(1, Math.round((pageDurationMs / 1000) * fps));
              
              return (
                <Sequence
                  key={`scene-${i}-page-${j}`}
                  from={fromFrame}
                  durationInFrames={Math.max(1, durationFrames)}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      width: "100%",
                      ...captionStyle,
                    }}
                  >
                    {page.lines.map((line, k) => {
                      return (
                        <p
                          style={{
                            fontSize: "6em",
                            fontFamily: fontFamily,
                            fontWeight: "black",
                            color: captionTextColor,
                            WebkitTextStroke: "2px black",
                            WebkitTextFillColor: captionTextColor,
                            textShadow: "0px 0px 10px black",
                            textAlign: "center",
                            width: "100%",
                            textTransform: "uppercase",
                          }}
                          key={`scene-${i}-page-${j}-line-${k}`}
                        >
                          {line.texts.map((text, l) => {
                            const textStartMs = text.startMs || 0;
                            const textEndMs = text.endMs || 0;
                            const active =
                              frame >=
                                startFrame + (textStartMs / 1000) * fps &&
                              frame <= startFrame + (textEndMs / 1000) * fps;
                            return (
                              <>
                                <span
                                  style={{
                                    fontWeight: "bold",
                                    ...(active ? activeStyle : {}),
                                  }}
                                  key={`scene-${i}-page-${j}-line-${k}-text-${l}`}
                                >
                                  {text.text}
                                </span>
                                {l < line.texts.length - 1 ? " " : ""}
                              </>
                            );
                          })}
                        </p>
                      );
                    })}
                  </div>
                </Sequence>
              );
            })}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
