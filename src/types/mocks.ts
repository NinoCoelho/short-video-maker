// Mock Types for Testing
// This file contains TypeScript interfaces for mock objects used in tests

import { MockedFunction } from 'vitest';

// === FFmpeg Mock Types ===

export interface MockFFmpegInstance {
  input: MockedFunction<any>;
  output: MockedFunction<any>;
  videoFilter: MockedFunction<any>;
  videoCodec: MockedFunction<any>;
  audioCodec: MockedFunction<any>;
  outputOptions: MockedFunction<any>;
  on: MockedFunction<any>;
  run: MockedFunction<any>;
  ffprobe: MockedFunction<any>;
}

export interface FFprobeStreamMock {
  codec_type: 'video' | 'audio';
  width?: number;
  height?: number;
  r_frame_rate?: string;
  codec_name: string;
  bit_rate?: number;
  duration?: number;
}

export interface FFprobeResultMock {
  streams: FFprobeStreamMock[];
  format?: {
    duration?: string;
    size?: string;
    format_name?: string;
  };
}

// === Sharp Mock Types ===

export interface MockSharpInstance {
  metadata: MockedFunction<any>;
  resize: MockedFunction<any>;
  extract: MockedFunction<any>;
  jpeg: MockedFunction<any>;
  png: MockedFunction<any>;
  toBuffer: MockedFunction<any>;
  toFile: MockedFunction<any>;
}

export interface SharpMetadataMock {
  width: number;
  height: number;
  channels: number;
  format: string;
}

// === Service Mock Types ===

export interface MockVideoImportService {
  importVideo: MockedFunction<any>;
  analyzeUrl: MockedFunction<any>;
  getJob: MockedFunction<any>;
  cancelJob: MockedFunction<any>;
  listJobs: MockedFunction<any>;
  on: MockedFunction<any>;
  emit: MockedFunction<any>;
}

export interface MockTranscriptionService {
  transcribe: MockedFunction<any>;
  getTranscription: MockedFunction<any>;
  deleteTranscription: MockedFunction<any>;
  getSupportedLanguages: MockedFunction<any>;
}

export interface MockCropService {
  cropVideo: MockedFunction<any>;
  analyzeMotion: MockedFunction<any>;
  detectScenes: MockedFunction<any>;
  generateThumbnails: MockedFunction<any>;
  cleanup: MockedFunction<any>;
}

// === Database/Storage Mock Types ===

export interface MockFileSystem {
  ensureDir: MockedFunction<typeof import('fs-extra').ensureDir>;
  remove: MockedFunction<typeof import('fs-extra').remove>;
  pathExists: MockedFunction<typeof import('fs-extra').pathExists>;
  readFile: MockedFunction<typeof import('fs-extra').readFile>;
  writeFile: MockedFunction<typeof import('fs-extra').writeFile>;
  readdir: MockedFunction<typeof import('fs-extra').readdir>;
  stat: MockedFunction<typeof import('fs-extra').stat>;
  copy: MockedFunction<typeof import('fs-extra').copy>;
  move: MockedFunction<typeof import('fs-extra').move>;
}

// === API Mock Types ===

export interface MockApiResponse<T = unknown> {
  status: number;
  statusText: string;
  data: T;
  headers: Record<string, string>;
}

export interface MockHttpClient {
  get: MockedFunction<any>;
  post: MockedFunction<any>;
  put: MockedFunction<any>;
  delete: MockedFunction<any>;
  patch: MockedFunction<any>;
}

// === Fetch Mock Types ===

export interface MockFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | FormData | BodyInit;
}

export interface MockFetchResponse {
  status: number;
  statusText: string;
  headers: Map<string, string>;
  json: MockedFunction<() => Promise<unknown>>;
  text: MockedFunction<() => Promise<string>>;
  ok: boolean;
}

export type MockFetch = MockedFunction<(url: string, options?: MockFetchOptions) => Promise<MockFetchResponse>>;

// === Event Emitter Mock Types ===

export interface MockEventEmitter {
  on: MockedFunction<any>;
  off: MockedFunction<any>;
  emit: MockedFunction<any>;
  once: MockedFunction<any>;
  removeAllListeners: MockedFunction<any>;
  listenerCount: MockedFunction<any>;
}

// === Test Data Types ===

export interface TestVideoMetadata {
  id: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  codec: string;
  bitrate: number;
  path: string;
}

export interface TestImportJob {
  id: string;
  sourceUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  createdAt: string;
  metadata?: TestVideoMetadata;
  error?: string;
}

export interface TestCropRequest {
  inputPath: string;
  outputPath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  startTime?: number;
  endTime?: number;
}

// === Mock Factory Types ===

export interface MockFactory<T> {
  create: (overrides?: Partial<T>) => T;
  createMany: (count: number, overrides?: Partial<T>) => T[];
}

// === Logger Mock Types ===

export interface MockLogger {
  info: MockedFunction<any>;
  error: MockedFunction<any>;
  warn: MockedFunction<any>;
  debug: MockedFunction<any>;
  trace: MockedFunction<any>;
  fatal: MockedFunction<any>;
}

// === Configuration Mock Types ===

export interface MockConfig {
  port: number;
  dataDir: string;
  tempDir: string;
  maxConcurrentJobs: number;
  enableCache: boolean;
  cacheMaxAge: number;
}

// === Type Guards for Mocks ===

export function isMockFunction(fn: unknown): fn is MockedFunction<any> {
  return typeof fn === 'function' && 'mock' in fn;
}

export function isMockFFmpegInstance(obj: unknown): obj is MockFFmpegInstance {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'input' in obj &&
    'output' in obj &&
    'run' in obj
  );
}