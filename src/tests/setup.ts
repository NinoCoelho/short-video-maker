/**
 * Global test setup for Vitest
 * This file is automatically loaded before all tests
 */

import { vi, afterEach } from 'vitest';
import dotenv from 'dotenv';
import '@testing-library/jest-dom';

// Load environment variables
dotenv.config({ path: '.env.test' });

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.CORS_ORIGIN = 'http://localhost:3232';
process.env.PROJECT_ROOT = process.cwd();

// Global mocks for external dependencies
vi.mock('@ffmpeg-installer/ffmpeg', () => ({
  path: '/usr/bin/ffmpeg',
}));

vi.mock('fluent-ffmpeg', () => {
  const mockFfmpeg = vi.fn(() => ({
    input: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
    audioCodec: vi.fn().mockReturnThis(),
    videoCodec: vi.fn().mockReturnThis(),
    format: vi.fn().mockReturnThis(),
    duration: vi.fn().mockReturnThis(),
    fps: vi.fn().mockReturnThis(),
    size: vi.fn().mockReturnThis(),
    aspect: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    run: vi.fn().mockImplementation((callback) => {
      if (callback) callback();
    }),
    ffprobe: vi.fn().mockImplementation((input, callback) => {
      callback(null, {
        streams: [
          {
            codec_type: 'video',
            width: 1920,
            height: 1080,
            duration: 30,
            r_frame_rate: '30/1',
          },
          {
            codec_type: 'audio',
            duration: 30,
          },
        ],
        format: {
          duration: 30,
        },
      });
    }),
  }));
  
  (mockFfmpeg as any).setFfmpegPath = vi.fn();
  (mockFfmpeg as any).setFfprobePath = vi.fn();
  
  return {
    default: mockFfmpeg,
    __esModule: true,
  };
});

// Mock file system operations
vi.mock('fs-extra', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 1024 })),
  createReadStream: vi.fn(),
  createWriteStream: vi.fn(() => ({
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  })),
  ensureDir: vi.fn(),
  remove: vi.fn(),
  copy: vi.fn(),
  pathExists: vi.fn(() => Promise.resolve(true)),
  stat: vi.fn(() => Promise.resolve({ size: 1024 })),
  readJson: vi.fn(() => Promise.resolve({})),
  writeJson: vi.fn(),
}));

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
    create: vi.fn(() => ({
      get: vi.fn(() => Promise.resolve({ data: {} })),
      post: vi.fn(() => Promise.resolve({ data: {} })),
    })),
  },
}));

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Global test utilities
(global as any).createMockResponse = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  end: vi.fn().mockReturnThis(),
  header: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
});

(global as any).createMockRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  ...overrides,
});