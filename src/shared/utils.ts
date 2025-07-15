import { z } from "zod";
import {
  type Caption,
  type CaptionPage,
  type CaptionLine,
  type OrientationEnum,
  MusicVolumeEnum,
  VoiceEnum,
} from "../types/shorts";
import { AvailableComponentsEnum, type OrientationConfig } from "../types/shorts";

export const shortVideoSchema = z.object({
  scenes: z.array(
    z.object({
      videos: z.array(z.string()),
      captions: z.custom<Caption[]>(),
      audio: z.object({
        url: z.string(),
        duration: z.number(),
      }),
    }),
  ),
  audio: z.object({
    url: z.string(),
    startTime: z.number(),
    endTime: z.number(),
  }).optional(),
  duration: z.number().optional(),
  fps: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  config: z.object({
    hook: z.string().optional(),
    paddingBack: z.number().optional(),
    captionPosition: z.enum(["top", "center", "bottom"]).optional(),
    captionBackgroundColor: z.string().optional(),
    captionTextColor: z.string().optional(),
    durationMs: z.number(),
    musicVolume: z.nativeEnum(MusicVolumeEnum).optional(),
    overlay: z.string().optional(),
    port: z.number().optional(),
    language: z.string().optional(),
    voice: z.nativeEnum(VoiceEnum).optional(),
  }),
  music: z.object({
    file: z.string(),
    url: z.string(),
    start: z.number(),
    end: z.number(),
    mood: z.string().optional(),
    fadeOut: z.boolean().optional(),
    fadeOutDuration: z.number().optional(),
    loop: z.boolean().optional(),
  }),
});

export function createCaptionPages({
  captions,
  lineMaxLength,
  lineCount,
  maxDistanceMs,
}: {
  captions: Caption[];
  lineMaxLength: number;
  lineCount: number;
  maxDistanceMs: number;
}) {
  console.log('[createCaptionPages] Input captions:', captions.map((c, i) => ({
    index: i,
    text: c.text,
    startMs: c.startMs,
    endMs: c.endMs,
    start: (c as any).start,
    end: (c as any).end
  })));

  const pages = [];
  let currentPage: CaptionPage = {
    startMs: 0,
    endMs: 0,
    lines: [],
  };
  let currentLine: CaptionLine = {
    texts: [],
  };

  captions.forEach((caption, i) => {
    // Handle both startMs/endMs and start/end field formats
    const startMs = caption.startMs ?? (caption as any).start ?? 0;
    const endMs = caption.endMs ?? (caption as any).end ?? 0;
    
    // Ensure we have valid timing values
    const validStartMs = isNaN(startMs) ? 0 : Math.max(0, startMs);
    const validEndMs = isNaN(endMs) ? Math.max(validStartMs + 100, 100) : Math.max(endMs, validStartMs + 100);

    console.log(`[createCaptionPages] Caption ${i}:`, {
      text: caption.text,
      originalStartMs: caption.startMs,
      originalEndMs: caption.endMs,
      originalStart: (caption as any).start,
      originalEnd: (caption as any).end,
      validStartMs,
      validEndMs
    });

    // Check if we need to start a new page due to time gap
    if (i > 0 && validStartMs - currentPage.endMs > maxDistanceMs) {
      // Add current line if not empty
      if (currentLine.texts.length > 0) {
        currentPage.lines.push(currentLine);
      }
      // Add current page if not empty
      if (currentPage.lines.length > 0) {
        pages.push(currentPage);
      }
      // Start new page
      currentPage = {
        startMs: validStartMs,
        endMs: validEndMs,
        lines: [],
      };
      currentLine = {
        texts: [],
      };
    }

    // Check if adding this caption exceeds the line length
    const currentLineText = currentLine.texts.map((t) => t.text).join(" ");
    if (
      currentLine.texts.length > 0 &&
      currentLineText.length + 1 + caption.text.length > lineMaxLength
    ) {
      // Line is full, add it to current page
      currentPage.lines.push(currentLine);
      currentLine = {
        texts: [],
      };

      // Check if page is full
      if (currentPage.lines.length >= lineCount) {
        // Page is full, add it to pages
        pages.push(currentPage);
        // Start new page
        currentPage = {
          startMs: validStartMs,
          endMs: validEndMs,
          lines: [],
        };
      }
    }

    // Add caption to current line
    currentLine.texts.push({
      text: caption.text,
      startMs: validStartMs,
      endMs: validEndMs,
    });

    // Update page timing
    currentPage.endMs = validEndMs;
    if (i === 0 || currentPage.startMs === 0) {
      currentPage.startMs = validStartMs;
    } else {
      currentPage.startMs = Math.min(currentPage.startMs, validStartMs);
    }
  });

  // Don't forget to add the last line and page
  if (currentLine.texts.length > 0) {
    currentPage.lines.push(currentLine);
  }
  if (currentPage.lines.length > 0) {
    pages.push(currentPage);
  }

  console.log('[createCaptionPages] Final pages:', pages.map((page, i) => ({
    pageIndex: i,
    startMs: page.startMs,
    endMs: page.endMs,
    durationMs: page.endMs - page.startMs,
    linesCount: page.lines.length,
    textsCount: page.lines.reduce((acc, line) => acc + line.texts.length, 0)
  })));

  return pages;
}

export function getOrientationConfig(orientation: OrientationEnum) {
  const config: Record<OrientationEnum, OrientationConfig> = {
    portrait: {
      width: 1080,
      height: 1920,
      component: AvailableComponentsEnum.PortraitVideo,
    },
    landscape: {
      width: 1920,
      height: 1080,
      component: AvailableComponentsEnum.LandscapeVideo,
    },
    square: {
      width: 1080,
      height: 1080,
      component: AvailableComponentsEnum.PortraitVideo,
    }
  };

  return config[orientation];
}

export function calculateVolume(
  level: MusicVolumeEnum = MusicVolumeEnum.high,
): [number, boolean] {
  switch (level) {
    case "muted":
      return [0, true];
    case "low":
      return [0.2, false];
    case "medium":
      return [0.45, false];
    case "high":
      return [0.7, false];
    default:
      return [0.7, false];
  }
}

/**
 * Resolve URLs in a port-agnostic way
 * - In browser context: uses relative URLs that work with current host
 * - In Remotion context: uses absolute URLs with correct port
 * - In server context: uses localhost with configured port
 */
export function resolveUrl(path: string, context: 'browser' | 'remotion' | 'server' = 'browser'): string {
  if (!path) return '';
  
  // If already absolute URL, return as is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  
  // Normalize path to start with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  switch (context) {
    case 'browser':
      // In browser, use relative URLs that work with current host
      return normalizedPath;
    
    case 'remotion':
      // In Remotion context, we need absolute URLs
      // Try to get port from environment or use default
      const remotionPort = process.env.PORT || process.env.REMOTION_SERVE_PORT || '3233';
      return `http://localhost:${remotionPort}${normalizedPath}`;
    
    case 'server':
      // In server context, use configured port
      const serverPort = process.env.PORT || '3233';
      return `http://localhost:${serverPort}${normalizedPath}`;
    
    default:
      return normalizedPath;
  }
}

/**
 * Get audio URL for different contexts
 */
export function getAudioUrl(filename: string, context: 'browser' | 'remotion' | 'server' = 'browser'): string {
  return resolveUrl(`/api/temp/${filename}`, context);
}

/**
 * Get music URL for different contexts
 */
export function getMusicUrl(filename: string, context: 'browser' | 'remotion' | 'server' = 'browser'): string {
  return resolveUrl(`/api/music/${encodeURIComponent(filename)}`, context);
}

export function getOverlayUrl(overlay: string, context: 'browser' | 'remotion' | 'server' = 'browser'): string {
  return resolveUrl(`/api/overlays/${overlay}.png`, context);
}

export function getVideoUrl(url: string): string {
  if (!url) return '';
  // URLs locais (do nosso próprio servidor de desenvolvimento ou de arquivos) não precisam de proxy.
  if (url.startsWith('/') || url.startsWith('file://')) {
    return url;
  }
  // Para URLs externas, use o proxy.
  return `/api/proxy?src=${encodeURIComponent(url)}`;
}
