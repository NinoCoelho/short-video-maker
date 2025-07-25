import Database from 'better-sqlite3';
import { logger } from '../logger';
import path from 'path';
import fs from 'fs';

export interface SQLitePool {
  query: (text: string, values?: any[]) => Promise<{ rows: any[], rowCount?: number }>;
  end: () => Promise<void>;
}

export class SQLiteAdapter implements SQLitePool {
  private db: Database.Database;
  private dbPath: string;

  constructor(dataDir: string) {
    // Ensure data directory exists
    const dbDir = path.join(dataDir, 'database');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.dbPath = path.join(dbDir, 'ia-script.db');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    
    logger.info(`SQLite database initialized at: ${this.dbPath}`);
    this.initializeTables();
  }

  private initializeTables(): void {
    // Create tables for IA Script feature
    this.db.exec(`
      -- Create uploaded files table
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id VARCHAR(32) PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100),
        size_bytes BIGINT,
        content TEXT, -- For text files
        metadata TEXT, -- JSON stored as text
        uploaded_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create script templates table
      CREATE TABLE IF NOT EXISTS script_templates (
        id VARCHAR(32) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        prompt_template TEXT NOT NULL,
        placeholders TEXT DEFAULT '[]', -- JSON array as text
        default_config TEXT DEFAULT '{}', -- JSON object as text
        file_associations TEXT DEFAULT '[]', -- JSON array as text
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        usage_count INTEGER DEFAULT 0,
        is_public BOOLEAN DEFAULT false
      );

      -- Create script sessions table
      CREATE TABLE IF NOT EXISTS script_sessions (
        id VARCHAR(32) PRIMARY KEY,
        template_id VARCHAR(32) REFERENCES script_templates(id) ON DELETE SET NULL,
        conversation_history TEXT DEFAULT '[]', -- JSON array as text
        current_script TEXT, -- JSON object as text
        config TEXT DEFAULT '{}', -- JSON object as text
        status VARCHAR(50) DEFAULT 'draft', -- draft, generating, completed, rendered
        video_id VARCHAR(32), -- Reference to created video
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create template file associations table (many-to-many)
      CREATE TABLE IF NOT EXISTS template_file_associations (
        template_id VARCHAR(32) REFERENCES script_templates(id) ON DELETE CASCADE,
        file_id VARCHAR(32) REFERENCES uploaded_files(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (template_id, file_id)
      );

      -- Create session file associations table (many-to-many)
      CREATE TABLE IF NOT EXISTS session_file_associations (
        session_id VARCHAR(32) REFERENCES script_sessions(id) ON DELETE CASCADE,
        file_id VARCHAR(32) REFERENCES uploaded_files(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (session_id, file_id)
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON uploaded_files(uploaded_by);
      CREATE INDEX IF NOT EXISTS idx_files_created_at ON uploaded_files(created_at);

      CREATE INDEX IF NOT EXISTS idx_templates_created_by ON script_templates(created_by);
      CREATE INDEX IF NOT EXISTS idx_templates_public ON script_templates(is_public);
      CREATE INDEX IF NOT EXISTS idx_templates_usage ON script_templates(usage_count DESC);
      CREATE INDEX IF NOT EXISTS idx_templates_created_at ON script_templates(created_at);

      CREATE INDEX IF NOT EXISTS idx_sessions_template ON script_sessions(template_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON script_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_created_by ON script_sessions(created_by);
      CREATE INDEX IF NOT EXISTS idx_sessions_video_id ON script_sessions(video_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON script_sessions(created_at);
    `);

    // Create trigger for updated_at (SQLite version)
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_script_templates_updated_at
      AFTER UPDATE ON script_templates
      FOR EACH ROW
      BEGIN
        UPDATE script_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;

      CREATE TRIGGER IF NOT EXISTS update_script_sessions_updated_at
      AFTER UPDATE ON script_sessions
      FOR EACH ROW
      BEGIN
        UPDATE script_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);

    logger.info('SQLite tables initialized');
  }

  async query(text: string, values?: any[]): Promise<{ rows: any[] }> {
    try {
      // Convert PostgreSQL-style placeholders ($1, $2) to SQLite style (?)
      let sqliteQuery = text;
      if (values && values.length > 0) {
        for (let i = values.length; i >= 1; i--) {
          sqliteQuery = sqliteQuery.replace(new RegExp(`\\$${i}`, 'g'), '?');
        }
      }

      // Handle PostgreSQL-specific syntax conversions
      sqliteQuery = this.convertPostgreSQLToSQLite(sqliteQuery);
      
      // Convert boolean values to integers for SQLite
      const convertedValues = values?.map(v => {
        if (typeof v === 'boolean') {
          return v ? 1 : 0;
        }
        return v;
      });

      // Handle different query types
      if (sqliteQuery.trim().toUpperCase().startsWith('SELECT')) {
        const rows = this.db.prepare(sqliteQuery).all(...(convertedValues || []));
        return { rows: this.parseJsonFields(rows) };
      } else if (sqliteQuery.trim().toUpperCase().startsWith('INSERT')) {
        // Handle RETURNING clause
        if (sqliteQuery.includes('RETURNING')) {
          const baseQuery = sqliteQuery.substring(0, sqliteQuery.indexOf('RETURNING')).trim();
          const returningClause = sqliteQuery.substring(sqliteQuery.indexOf('RETURNING') + 9).trim();
          
          const stmt = this.db.prepare(baseQuery);
          const result = stmt.run(...(convertedValues || []));
          
          // Get the inserted row
          const selectQuery = `SELECT ${returningClause} FROM ${this.extractTableName(baseQuery)} WHERE rowid = ?`;
          const rows = this.db.prepare(selectQuery).all(result.lastInsertRowid);
          return { rows: this.parseJsonFields(rows) };
        } else {
          const stmt = this.db.prepare(sqliteQuery);
          stmt.run(...(convertedValues || []));
          return { rows: [], rowCount: 0 };
        }
      } else if (sqliteQuery.trim().toUpperCase().startsWith('BEGIN')) {
        this.db.exec('BEGIN TRANSACTION');
        return { rows: [], rowCount: 0 };
      } else if (sqliteQuery.trim().toUpperCase().startsWith('COMMIT')) {
        this.db.exec('COMMIT');
        return { rows: [], rowCount: 0 };
      } else if (sqliteQuery.trim().toUpperCase().startsWith('ROLLBACK')) {
        this.db.exec('ROLLBACK');
        return { rows: [], rowCount: 0 };
      } else {
        // UPDATE, DELETE, etc.
        const stmt = this.db.prepare(sqliteQuery);
        const result = stmt.run(...(convertedValues || []));
        
        // Handle RETURNING for UPDATE/DELETE
        if (sqliteQuery.includes('RETURNING')) {
          const baseQuery = sqliteQuery.substring(0, sqliteQuery.indexOf('RETURNING')).trim();
          const returningClause = sqliteQuery.substring(sqliteQuery.indexOf('RETURNING') + 9).trim();
          const tableName = this.extractTableName(baseQuery);
          
          // For now, return empty array as getting affected rows is complex
          return { rows: [], rowCount: result.changes };
        }
        
        return { rows: [], rowCount: result.changes };
      }
    } catch (error) {
      logger.error('SQLite query error:', error);
      throw error;
    }
  }

  private convertPostgreSQLToSQLite(query: string): string {
    // Convert ::jsonb cast to JSON manipulation
    let converted = query.replace(/::jsonb/g, '');
    
    // Convert ILIKE to LIKE (SQLite LIKE is case-insensitive by default)
    converted = converted.replace(/ILIKE/g, 'LIKE');
    
    // Convert array concatenation (|| for JSONB arrays)
    // Example: conversation_history || $1::jsonb becomes 
    // json_array(json_each.value) || json($1)
    if (converted.includes('||') && converted.includes('conversation_history')) {
      // This is a complex case - for now, we'll handle it in the application layer
      // by reading the current value, appending, and updating
      converted = converted.replace(
        /conversation_history\s*=\s*conversation_history\s*\|\|\s*\?/,
        'conversation_history = ?'
      );
    }
    
    return converted;
  }

  private parseJsonFields(rows: any[]): any[] {
    // Parse JSON fields that are stored as text
    const jsonFields = [
      'placeholders', 'default_config', 'file_associations',
      'conversation_history', 'current_script', 'config', 'metadata'
    ];
    
    return rows.map(row => {
      const parsed = { ...row };
      for (const field of jsonFields) {
        if (parsed[field] && typeof parsed[field] === 'string') {
          try {
            parsed[field] = JSON.parse(parsed[field]);
          } catch (e) {
            // Keep as string if parsing fails
          }
        }
      }
      // Convert SQLite boolean representation (0/1) back to boolean
      if ('is_public' in parsed && typeof parsed.is_public === 'number') {
        parsed.is_public = parsed.is_public === 1;
      }
      return parsed;
    });
  }

  private extractTableName(query: string): string {
    const match = query.match(/(?:FROM|INTO|UPDATE)\s+(\w+)/i);
    return match ? match[1] : '';
  }

  async end(): Promise<void> {
    this.db.close();
    logger.info('SQLite database connection closed');
  }
}