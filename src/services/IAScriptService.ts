import { Pool } from 'pg';
import { SQLitePool } from '../database/SQLiteAdapter';
import cuid from 'cuid';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { logger } from '../logger';
import {
  ScriptTemplate,
  ScriptSession,
  UploadedFile,
  ChatMessage,
  GeneratedScript,
  PlaceholderDefinition,
  FileMetadata,
  SessionStatus,
  CreateTemplateRequest,
  CreateSessionRequest,
  SendChatMessageRequest,
  ExtractContentRequest
} from '../types/iaScript';
import { RenderConfig } from '../types/shorts';

export class IAScriptService {
  private pool: Pool | SQLitePool;
  private geminiApi?: GoogleGenerativeAI;
  private openaiApi?: OpenAI;

  constructor(pool: Pool | SQLitePool) {
    this.pool = pool;
    
    // Initialize AI APIs
    logger.info('Initializing IA Script Service with API keys:', {
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY
    });
    
    if (process.env.GEMINI_API_KEY) {
      this.geminiApi = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      logger.info('Gemini API initialized');
    }
    if (process.env.OPENAI_API_KEY) {
      this.openaiApi = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      logger.info('OpenAI API initialized');
    }
  }

  // Template Management
  async createTemplate(data: CreateTemplateRequest, userId?: string): Promise<ScriptTemplate> {
    const id = cuid();
    const now = new Date();

    try {
      await this.pool.query('BEGIN');

      // Insert template
      const templateResult = await this.pool.query(
        `INSERT INTO script_templates 
         (id, name, description, prompt_template, placeholders, default_config, created_by, is_public)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          id,
          data.name,
          data.description || null,
          data.promptTemplate,
          JSON.stringify(data.placeholders),
          JSON.stringify(data.defaultConfig),
          userId || null,
          data.isPublic || false
        ]
      );

      // Associate files with template
      if (data.fileIds && data.fileIds.length > 0) {
        const fileAssociations = data.fileIds.map(fileId => 
          `('${id}', '${fileId}')`
        ).join(',');
        
        await this.pool.query(
          `INSERT INTO template_file_associations (template_id, file_id)
           VALUES ${fileAssociations}`
        );
      }

      await this.pool.query('COMMIT');

      return this.mapTemplateFromDb(templateResult.rows[0]);
    } catch (error) {
      await this.pool.query('ROLLBACK');
      logger.error('Failed to create template:', error);
      throw error;
    }
  }

  async getTemplate(id: string): Promise<ScriptTemplate | null> {
    const result = await this.pool.query(
      'SELECT * FROM script_templates WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapTemplateFromDb(result.rows[0]);
  }

  async listTemplates(filters?: {
    isPublic?: boolean;
    createdBy?: string;
    search?: string;
  }): Promise<ScriptTemplate[]> {
    let query = 'SELECT * FROM script_templates WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.isPublic !== undefined) {
      query += ` AND is_public = $${paramIndex}`;
      params.push(filters.isPublic);
      paramIndex++;
    }

    if (filters?.createdBy) {
      query += ` AND created_by = $${paramIndex}`;
      params.push(filters.createdBy);
      paramIndex++;
    }

    if (filters?.search) {
      query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    query += ' ORDER BY usage_count DESC, created_at DESC';

    const result = await this.pool.query(query, params);
    return result.rows.map(row => this.mapTemplateFromDb(row));
  }

  async updateTemplate(id: string, updates: Partial<CreateTemplateRequest>): Promise<ScriptTemplate | null> {
    const setClause: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClause.push(`name = $${paramIndex}`);
      params.push(updates.name);
      paramIndex++;
    }

    if (updates.description !== undefined) {
      setClause.push(`description = $${paramIndex}`);
      params.push(updates.description);
      paramIndex++;
    }

    if (updates.promptTemplate !== undefined) {
      setClause.push(`prompt_template = $${paramIndex}`);
      params.push(updates.promptTemplate);
      paramIndex++;
    }

    if (updates.placeholders !== undefined) {
      setClause.push(`placeholders = $${paramIndex}`);
      params.push(JSON.stringify(updates.placeholders));
      paramIndex++;
    }

    if (updates.defaultConfig !== undefined) {
      setClause.push(`default_config = $${paramIndex}`);
      params.push(JSON.stringify(updates.defaultConfig));
      paramIndex++;
    }

    if (setClause.length === 0) {
      return this.getTemplate(id);
    }

    params.push(id);
    const result = await this.pool.query(
      `UPDATE script_templates 
       SET ${setClause.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapTemplateFromDb(result.rows[0]);
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM script_templates WHERE id = $1',
      [id]
    );
    return result.rowCount > 0;
  }

  async incrementTemplateUsage(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE script_templates SET usage_count = usage_count + 1 WHERE id = $1',
      [id]
    );
  }

  // Session Management
  async createSession(data: CreateSessionRequest, userId?: string): Promise<ScriptSession> {
    const id = cuid();
    const now = new Date();

    let config = data.config || {};
    
    // If using a template, load its default config
    if (data.templateId) {
      const template = await this.getTemplate(data.templateId);
      if (template) {
        config = { ...template.defaultConfig, ...config };
      }
    }

    const result = await this.pool.query(
      `INSERT INTO script_sessions 
       (id, template_id, config, status, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        id,
        data.templateId || null,
        JSON.stringify(config),
        'draft',
        userId || null
      ]
    );

    return this.mapSessionFromDb(result.rows[0]);
  }

  async getSession(id: string): Promise<ScriptSession | null> {
    const result = await this.pool.query(
      'SELECT * FROM script_sessions WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapSessionFromDb(result.rows[0]);
  }

  async updateSessionStatus(id: string, status: SessionStatus): Promise<void> {
    await this.pool.query(
      'UPDATE script_sessions SET status = $1 WHERE id = $2',
      [status, id]
    );
  }

  async updateSessionScript(id: string, script: GeneratedScript): Promise<void> {
    await this.pool.query(
      'UPDATE script_sessions SET current_script = $1, status = $2 WHERE id = $3',
      [JSON.stringify(script), 'completed', id]
    );
  }

  async addChatMessage(sessionId: string, message: ChatMessage): Promise<void> {
    // Handle JSONB concatenation differently for SQLite
    if ('prepare' in (this.pool as any)) {
      // This is SQLite - fetch current history, append, and update
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      
      const updatedHistory = [...(session.conversationHistory || []), message];
      
      await this.pool.query(
        'UPDATE script_sessions SET conversation_history = $1 WHERE id = $2',
        [JSON.stringify(updatedHistory), sessionId]
      );
    } else {
      // PostgreSQL - use native JSONB concatenation
      await this.pool.query(
        `UPDATE script_sessions 
         SET conversation_history = conversation_history || $1::jsonb
         WHERE id = $2`,
        [JSON.stringify(message), sessionId]
      );
    }
  }

  // File Management
  async uploadFile(
    file: Express.Multer.File,
    userId?: string
  ): Promise<UploadedFile> {
    const id = cuid();
    const content = file.buffer.toString('utf-8');
    
    // Calculate metadata
    const lines = content.split('\n');
    const words = content.split(/\s+/).filter(w => w.length > 0);
    
    const metadata: FileMetadata = {
      lineCount: lines.length,
      wordCount: words.length,
      charCount: content.length
    };

    const result = await this.pool.query(
      `INSERT INTO uploaded_files 
       (id, filename, original_name, mime_type, size_bytes, content, metadata, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        file.filename || file.originalname,
        file.originalname,
        file.mimetype,
        file.size,
        content,
        JSON.stringify(metadata),
        userId || null
      ]
    );

    return this.mapFileFromDb(result.rows[0]);
  }

  async getFile(id: string): Promise<UploadedFile | null> {
    const result = await this.pool.query(
      'SELECT * FROM uploaded_files WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapFileFromDb(result.rows[0]);
  }

  async listFiles(userId?: string): Promise<UploadedFile[]> {
    let query = 'SELECT * FROM uploaded_files';
    const params: any[] = [];

    if (userId) {
      query += ' WHERE uploaded_by = $1';
      params.push(userId);
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.pool.query(query, params);
    return result.rows.map(row => this.mapFileFromDb(row));
  }

  async deleteFile(id: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM uploaded_files WHERE id = $1',
      [id]
    );
    return result.rowCount > 0;
  }

  // Content Extraction
  async extractContent(
    fileId: string, 
    request: ExtractContentRequest
  ): Promise<{ content: string; metadata: any }> {
    const file = await this.getFile(fileId);
    if (!file) {
      throw new Error('File not found');
    }

    const lines = file.content.split('\n');
    let extractedContent = '';
    let sourceLines: number[] = [];

    switch (request.type) {
      case 'full_file':
        extractedContent = file.content;
        sourceLines = Array.from({ length: lines.length }, (_, i) => i + 1);
        break;

      case 'partial_file':
        const start = (request.config?.lineStart || 1) - 1;
        const end = request.config?.lineEnd || lines.length;
        extractedContent = lines.slice(start, end).join('\n');
        sourceLines = Array.from({ length: end - start }, (_, i) => start + i + 1);
        break;

      case 'random_lines':
        const count = request.config?.randomCount || 5;
        const randomIndices = this.getRandomIndices(lines.length, count);
        extractedContent = randomIndices.map(i => lines[i]).join('\n');
        sourceLines = randomIndices.map(i => i + 1);
        break;

      case 'custom':
        // Implement custom pattern matching if needed
        extractedContent = file.content;
        break;
    }

    return {
      content: extractedContent,
      metadata: {
        linesExtracted: sourceLines.length,
        sourceLines
      }
    };
  }

  // Placeholder Resolution
  async resolvePlaceholders(
    template: string,
    placeholderValues: Record<string, string>,
    files: UploadedFile[]
  ): Promise<string> {
    let resolved = template;

    // Replace placeholders with their values
    for (const [placeholder, value] of Object.entries(placeholderValues)) {
      const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
      resolved = resolved.replace(regex, value);
    }

    return resolved;
  }

  // AI Script Generation
  async generateScript(
    prompt: string,
    config: RenderConfig,
    aiProvider?: 'openai' | 'gemini'
  ): Promise<GeneratedScript> {
    const provider = aiProvider || (this.geminiApi ? 'gemini' : 'openai');
    
    logger.info('Generating script with:', {
      provider,
      hasGeminiApi: !!this.geminiApi,
      hasOpenAIApi: !!this.openaiApi,
      promptLength: prompt.length
    });
    
    try {
      if (provider === 'gemini' && this.geminiApi) {
        return await this.generateWithGemini(prompt, config);
      } else if (provider === 'openai' && this.openaiApi) {
        return await this.generateWithOpenAI(prompt, config);
      } else {
        logger.error('No AI provider available:', {
          provider,
          hasGeminiApi: !!this.geminiApi,
          hasOpenAIApi: !!this.openaiApi
        });
        throw new Error('No AI provider available');
      }
    } catch (error) {
      logger.error('Script generation failed:', {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error,
        provider,
        hasGeminiApi: !!this.geminiApi,
        hasOpenAIApi: !!this.openaiApi
      });
      throw error;
    }
  }

  private async generateWithGemini(
    prompt: string,
    config: RenderConfig
  ): Promise<GeneratedScript> {
    const model = this.geminiApi!.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const systemPrompt = this.buildSystemPrompt(config);
    const fullPrompt = `${systemPrompt}\n\nUser request: ${prompt}`;
    
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();
    
    return this.parseScriptResponse(text, 'gemini');
  }

  private async generateWithOpenAI(
    prompt: string,
    config: RenderConfig
  ): Promise<GeneratedScript> {
    const systemPrompt = this.buildSystemPrompt(config);
    
    const completion = await this.openaiApi!.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });
    
    const text = completion.choices[0].message.content || '';
    return this.parseScriptResponse(text, 'openai');
  }

  private buildSystemPrompt(config: RenderConfig): string {
    return `You are an AI script writer for short-form videos (TikTok, Instagram Reels, YouTube Shorts).
    
Create a compelling video script with the following requirements:
- Target duration: ${config.orientation === 'portrait' ? '30-60' : '60-90'} seconds
- Language: ${config.language || 'pt'}
- Style: Engaging, conversational, and optimized for social media

Return the script in the following JSON format:
{
  "title": "Script title",
  "description": "Brief description",
  "scenes": [
    {
      "sceneNumber": 1,
      "text": "What the narrator will say",
      "duration": "5s",
      "visualSuggestion": "What should appear on screen",
      "searchKeywords": ["keyword1", "keyword2", "keyword3"]
    }
  ]
}

Guidelines:
1. Hook viewers in the first 3 seconds
2. Keep each scene concise (5-10 seconds max)
3. Use simple, conversational language
4. Include 3-5 search keywords per scene for background videos
5. End with a clear call-to-action or memorable closing`;
  }

  private parseScriptResponse(text: string, provider: string): GeneratedScript {
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Calculate total duration
      const totalScenes = parsed.scenes.length;
      const estimatedDuration = parsed.scenes.reduce((total: number, scene: any) => {
        const duration = parseInt(scene.duration) || 5;
        return total + duration;
      }, 0);
      
      return {
        title: parsed.title || 'Generated Script',
        description: parsed.description,
        scenes: parsed.scenes || [],
        metadata: {
          aiProvider: provider,
          totalScenes,
          estimatedDuration,
          generatedAt: new Date()
        }
      };
    } catch (error) {
      logger.error('Failed to parse script response:', error);
      throw new Error('Failed to parse AI response');
    }
  }

  // Helper methods
  private mapTemplateFromDb(row: any): ScriptTemplate {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      promptTemplate: row.prompt_template,
      placeholders: row.placeholders || [],
      defaultConfig: row.default_config || {},
      fileAssociations: row.file_associations || [],
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      usageCount: row.usage_count,
      isPublic: row.is_public
    };
  }

  private mapSessionFromDb(row: any): ScriptSession {
    return {
      id: row.id,
      templateId: row.template_id,
      conversationHistory: row.conversation_history || [],
      currentScript: row.current_script,
      config: row.config || {},
      status: row.status,
      videoId: row.video_id,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private mapFileFromDb(row: any): UploadedFile {
    return {
      id: row.id,
      filename: row.filename,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      content: row.content,
      metadata: row.metadata,
      uploadedBy: row.uploaded_by,
      createdAt: new Date(row.created_at)
    };
  }

  private getRandomIndices(length: number, count: number): number[] {
    const indices: number[] = [];
    const available = Array.from({ length }, (_, i) => i);
    
    for (let i = 0; i < Math.min(count, length); i++) {
      const randomIndex = Math.floor(Math.random() * available.length);
      indices.push(available[randomIndex]);
      available.splice(randomIndex, 1);
    }
    
    return indices.sort((a, b) => a - b);
  }
}