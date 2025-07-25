# IA Script Feature - Design Document

## Executive Summary

The IA Script feature transforms the current basic script generator into a sophisticated chat-based interface with file upload capabilities, template management, and advanced configuration options. This feature enables users to create video scripts using AI while leveraging uploaded content as source material, with a flexible placeholder system for content insertion.

## Feature Overview

### Key Capabilities
1. **Chat-like Interface**: Interactive conversation flow for script creation
2. **File Upload System**: Support for text files as content sources
3. **Placeholder System**: Dynamic content insertion (full file, partial text, random lines)
4. **Template Management**: Save and reuse prompts with associated files
5. **Configuration Persistence**: Save all video settings with templates
6. **Direct Rendering**: Option to render immediately or review in Video Studio

## Architecture Design

### System Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│                     │     │                      │     │                     │
│   Frontend (React)  │────▶│  Backend (Express)   │────▶│  Database (PostgreSQL)│
│                     │     │                      │     │                     │
└─────────────────────┘     └──────────────────────┘     └─────────────────────┘
         │                           │                             │
         │                           │                             │
    ┌────▼────┐              ┌──────▼──────┐            ┌────────▼────────┐
    │  Chat   │              │ IAScript    │            │ Templates Table │
    │   UI    │              │  Service    │            │ Sessions Table  │
    └─────────┘              └─────────────┘            │ Files Table     │
                                    │                    └─────────────────┘
                                    │
                             ┌──────▼──────┐
                             │   AI APIs   │
                             │ (OpenAI/    │
                             │  Gemini)    │
                             └─────────────┘
```

### Data Models

#### 1. Script Templates Table
```sql
CREATE TABLE script_templates (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  prompt_template TEXT NOT NULL,
  placeholders JSONB, -- Array of placeholder definitions
  default_config JSONB, -- Default video configuration
  file_associations JSONB, -- Associated file IDs
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  usage_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT false
);

CREATE INDEX idx_templates_created_by ON script_templates(created_by);
CREATE INDEX idx_templates_public ON script_templates(is_public);
```

#### 2. Script Sessions Table
```sql
CREATE TABLE script_sessions (
  id VARCHAR(32) PRIMARY KEY,
  template_id VARCHAR(32) REFERENCES script_templates(id),
  conversation_history JSONB, -- Array of messages
  current_script JSONB, -- Generated script
  config JSONB, -- Video configuration
  status VARCHAR(50), -- draft, generating, completed, rendered
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_template ON script_sessions(template_id);
CREATE INDEX idx_sessions_status ON script_sessions(status);
```

#### 3. Uploaded Files Table
```sql
CREATE TABLE uploaded_files (
  id VARCHAR(32) PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  size_bytes BIGINT,
  content TEXT, -- For text files
  metadata JSONB, -- Line count, word count, etc.
  uploaded_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_files_uploaded_by ON uploaded_files(uploaded_by);
```

### TypeScript Interfaces

```typescript
// src/types/iaScript.ts

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

export interface PlaceholderDefinition {
  id: string;
  name: string;
  type: 'full_file' | 'partial_file' | 'random_lines' | 'custom';
  config?: {
    lineStart?: number;
    lineEnd?: number;
    randomCount?: number;
    customPattern?: string;
  };
}

export interface ScriptSession {
  id: string;
  templateId?: string;
  conversationHistory: ChatMessage[];
  currentScript?: GeneratedScript;
  config: RenderConfig;
  status: 'draft' | 'generating' | 'completed' | 'rendered';
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    filesUsed?: string[];
    placeholdersResolved?: Record<string, string>;
  };
}

export interface UploadedFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  content: string;
  metadata: {
    lineCount: number;
    wordCount: number;
    charCount: number;
  };
  uploadedBy?: string;
  createdAt: Date;
}

export interface GeneratedScript {
  title: string;
  description?: string;
  scenes: ScriptScene[];
  metadata: {
    aiProvider: string;
    templateUsed?: string;
    filesUsed?: string[];
    generatedAt: Date;
  };
}
```

## API Design

### RESTful Endpoints

#### Template Management
```
POST   /api/ia-script/templates          - Create new template
GET    /api/ia-script/templates          - List templates (with filters)
GET    /api/ia-script/templates/:id      - Get template details
PUT    /api/ia-script/templates/:id      - Update template
DELETE /api/ia-script/templates/:id      - Delete template
POST   /api/ia-script/templates/:id/use  - Use template (creates session)
```

#### Session Management
```
POST   /api/ia-script/sessions           - Create new session
GET    /api/ia-script/sessions/:id       - Get session details
PUT    /api/ia-script/sessions/:id       - Update session
POST   /api/ia-script/sessions/:id/chat  - Send chat message
POST   /api/ia-script/sessions/:id/render - Render video from session
DELETE /api/ia-script/sessions/:id       - Delete session
```

#### File Management
```
POST   /api/ia-script/files/upload       - Upload file
GET    /api/ia-script/files              - List uploaded files
GET    /api/ia-script/files/:id          - Get file details
DELETE /api/ia-script/files/:id          - Delete file
POST   /api/ia-script/files/:id/extract  - Extract content with placeholder
```

### WebSocket Events

```typescript
// Server -> Client
'session:update'        - Session state changed
'script:generated'      - Script generation complete
'chat:response'         - AI response ready
'file:processed'        - File upload processed

// Client -> Server
'session:join'          - Join session room
'chat:message'          - Send chat message
'placeholder:resolve'   - Request placeholder resolution
```

## UI/UX Design

### Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Header: IA Script Studio                         [Templates] │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────┬─────────────────────────────┬─────────────┐ │
│ │ Files Panel │      Chat Interface         │ Config Panel│ │
│ │             │                             │             │ │
│ │ [Upload]    │ ┌─────────────────────────┐ │ Voice: []   │ │
│ │             │ │                         │ │ Music: []   │ │
│ │ file1.txt   │ │  Chat messages here   │ │ Lang:  []   │ │
│ │ file2.txt   │ │                         │ │             │ │
│ │             │ └─────────────────────────┘ │ [More...]   │ │
│ │             │                             │             │ │
│ │             │ ┌─────────────────────────┐ │             │ │
│ │             │ │ Input with placeholders │ │ [Save as    │ │
│ │             │ │ [Send]                  │ │  Template]  │ │
│ │             │ └─────────────────────────┘ │             │ │
│ └─────────────┴─────────────────────────────┴─────────────┘ │
│ [Review in Video Studio]              [Render Immediately]   │
└─────────────────────────────────────────────────────────────┘
```

### Component Structure

```
src/ui/pages/
├── IAScriptStudio.tsx         - Main page component
├── components/
│   ├── ia-script/
│   │   ├── ChatInterface.tsx      - Chat UI component
│   │   ├── FilePanel.tsx          - File upload/management
│   │   ├── ConfigPanel.tsx        - Video configuration
│   │   ├── TemplateManager.tsx    - Template CRUD UI
│   │   ├── PlaceholderInput.tsx   - Smart input with placeholders
│   │   └── ScriptPreview.tsx      - Preview generated script
```

### User Flow

1. **Initial Access**
   - User navigates to IA Script Studio
   - Option to start fresh or load template
   - Recent sessions displayed

2. **File Upload Flow**
   - Drag & drop or click to upload
   - File processed and metadata extracted
   - File appears in side panel with preview

3. **Chat Interaction**
   - User types prompt with placeholders
   - Placeholders show as chips/badges
   - Click placeholder to configure (full/partial/random)
   - Send message to generate script

4. **Template Creation**
   - After successful generation
   - Click "Save as Template"
   - Name template and add description
   - Template saved with prompt, files, and config

5. **Rendering Flow**
   - Two options after script generation:
     a. "Review in Video Studio" - Navigate to existing studio
     b. "Render Immediately" - Direct to queue

## Implementation Details

### File Upload Security
```typescript
// Validation middleware
const validateFileUpload = (req, res, next) => {
  const file = req.file;
  
  // Check file type
  const allowedTypes = ['text/plain', 'text/markdown', 'text/csv'];
  if (!allowedTypes.includes(file.mimetype)) {
    return res.status(400).json({ error: 'Invalid file type' });
  }
  
  // Check file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'File too large' });
  }
  
  // Sanitize filename
  file.sanitizedName = sanitizeFilename(file.originalname);
  
  next();
};
```

### Placeholder Resolution
```typescript
class PlaceholderResolver {
  resolve(template: string, files: UploadedFile[], config: PlaceholderConfig): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, placeholder) => {
      const [fileRef, operation] = placeholder.split(':');
      const file = files.find(f => f.id === fileRef);
      
      if (!file) return match;
      
      switch (operation) {
        case 'full':
          return file.content;
        case 'lines':
          return this.extractLines(file, config);
        case 'random':
          return this.extractRandom(file, config);
        default:
          return match;
      }
    });
  }
}
```

### Real-time Chat Implementation
```typescript
// Frontend hook
export const useIAScriptChat = (sessionId: string) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  
  useEffect(() => {
    const socket = io('/ia-script');
    
    socket.emit('session:join', sessionId);
    
    socket.on('chat:response', (message) => {
      setMessages(prev => [...prev, message]);
      setIsGenerating(false);
    });
    
    return () => socket.disconnect();
  }, [sessionId]);
  
  const sendMessage = async (content: string, files: string[]) => {
    setIsGenerating(true);
    await api.post(`/api/ia-script/sessions/${sessionId}/chat`, {
      content,
      files
    });
  };
  
  return { messages, sendMessage, isGenerating };
};
```

## Integration Points

### With Existing Systems

1. **Video Creation Pipeline**
   - Generated scripts compatible with existing SceneInput format
   - Config carries over to ShortCreator.addToQueue()

2. **Translation Service**
   - Templates can specify target language
   - Auto-translate prompts for multilingual support

3. **Library Manager**
   - Access music/overlay library from config panel
   - Save frequently used assets with templates

4. **WebSocket Server**
   - Extend existing WebSocket infrastructure
   - Add new namespace for IA Script events

## Migration Strategy

1. **Phase 1**: Database setup and backend services
2. **Phase 2**: Basic chat UI without templates
3. **Phase 3**: File upload and placeholder system
4. **Phase 4**: Template management
5. **Phase 5**: Advanced features (sharing, analytics)

## Performance Considerations

- **File Storage**: Store file content in database for <1MB, filesystem for larger
- **Caching**: Cache resolved templates in Redis
- **Rate Limiting**: Limit AI calls per session/user
- **Streaming**: Stream large script responses
- **Pagination**: Paginate template lists and file lists

## Security Considerations

- **File Upload**: Strict validation, virus scanning, sandboxed storage
- **Template Injection**: Sanitize all template content
- **Access Control**: User-based permissions for templates/files
- **Rate Limiting**: Prevent AI API abuse
- **Data Privacy**: Encrypt sensitive content at rest

## Future Enhancements

1. **Collaboration**: Real-time collaborative editing
2. **Version Control**: Template versioning with diff view
3. **Analytics**: Usage statistics for templates
4. **Marketplace**: Public template sharing
5. **AI Training**: Fine-tune on successful scripts
6. **Multi-modal**: Support image/video uploads as context