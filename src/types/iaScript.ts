import { RenderConfig } from './shorts';

// Placeholder types
export type PlaceholderType = 'full_file' | 'partial_file' | 'random_lines' | 'custom';

export interface PlaceholderConfig {
  lineStart?: number;
  lineEnd?: number;
  randomCount?: number;
  customPattern?: string;
}

export interface PlaceholderDefinition {
  id: string;
  name: string;
  type: PlaceholderType;
  fileId?: string;
  config?: PlaceholderConfig;
}

// File types
export interface FileMetadata {
  lineCount: number;
  wordCount: number;
  charCount: number;
}

export interface UploadedFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  content: string;
  metadata: FileMetadata;
  uploadedBy?: string;
  createdAt: Date;
}

// Template types
export interface ScriptTemplate {
  id: string;
  name: string;
  description?: string;
  promptTemplate: string;
  placeholders: PlaceholderDefinition[];
  defaultConfig: Partial<RenderConfig>;
  fileAssociations: string[]; // File IDs
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  usageCount: number;
  isPublic: boolean;
}

// Session types
export type SessionStatus = 'draft' | 'generating' | 'completed' | 'rendered';

export interface ChatMessageMetadata {
  filesUsed?: string[];
  placeholdersResolved?: Record<string, string>;
  generationTime?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: ChatMessageMetadata;
}

export interface GeneratedScript {
  title: string;
  description?: string;
  scenes: Array<{
    sceneNumber: number;
    text: string;
    duration: string;
    visualSuggestion?: string;
    searchKeywords: string[];
  }>;
  metadata: {
    aiProvider: string;
    templateUsed?: string;
    filesUsed?: string[];
    totalScenes: number;
    estimatedDuration: number;
    generatedAt: Date;
  };
}

export interface ScriptSession {
  id: string;
  templateId?: string;
  conversationHistory: ChatMessage[];
  currentScript?: GeneratedScript;
  config: RenderConfig;
  status: SessionStatus;
  videoId?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// API Request/Response types
export interface CreateTemplateRequest {
  name: string;
  description?: string;
  promptTemplate: string;
  placeholders: PlaceholderDefinition[];
  defaultConfig: Partial<RenderConfig>;
  fileIds: string[];
  isPublic?: boolean;
}

export interface CreateSessionRequest {
  templateId?: string;
  config?: Partial<RenderConfig>;
}

export interface SendChatMessageRequest {
  content: string;
  fileIds?: string[];
  placeholderValues?: Record<string, string>;
}

export interface UploadFileResponse {
  file: UploadedFile;
  preview: string; // First few lines
}

export interface ExtractContentRequest {
  type: PlaceholderType;
  config?: PlaceholderConfig;
}

export interface ExtractContentResponse {
  content: string;
  metadata: {
    linesExtracted?: number;
    sourceLines?: number[];
  };
}