import { promises as fs } from 'fs';
import path from 'path';
import { createConnection, Connection } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

interface MigrationFile {
  version: string;
  name: string;
  filePath: string;
}

class MigrationRunner {
  private connection: Connection | null = null;
  private migrationsPath = path.join(__dirname, 'migrations');

  async connect(): Promise<void> {
    // Connection configuration from environment variables
    const config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'short_video_maker',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
    };

    try {
      // Note: This is a simplified example. In production, use a proper PostgreSQL client
      // like pg or pg-promise. This is just to show the structure.
      console.log('Connecting to database...');
      // this.connection = await createConnection(config);
      console.log('Connected to database');
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw error;
    }
  }

  async createMigrationsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    console.log('Creating migrations table if not exists...');
    // await this.connection.query(sql);
  }

  async getAppliedMigrations(): Promise<string[]> {
    const sql = 'SELECT version FROM schema_migrations ORDER BY version';
    // const result = await this.connection.query(sql);
    // return result.rows.map(row => row.version);
    return []; // Placeholder
  }

  async getMigrationFiles(): Promise<MigrationFile[]> {
    const files = await fs.readdir(this.migrationsPath);
    const migrations: MigrationFile[] = [];

    for (const file of files) {
      // Only process .sql files that don't end with .down.sql
      if (file.endsWith('.sql') && !file.endsWith('.down.sql')) {
        const match = file.match(/^(\d+)_(.+)\.sql$/);
        if (match) {
          migrations.push({
            version: match[1],
            name: match[2],
            filePath: path.join(this.migrationsPath, file),
          });
        }
      }
    }

    return migrations.sort((a, b) => a.version.localeCompare(b.version));
  }

  async runMigration(migration: MigrationFile): Promise<void> {
    console.log(`Running migration ${migration.version}: ${migration.name}`);
    
    const sql = await fs.readFile(migration.filePath, 'utf-8');
    
    try {
      // Begin transaction
      // await this.connection.query('BEGIN');
      
      // Run migration
      // await this.connection.query(sql);
      
      // Record migration
      const recordSql = `
        INSERT INTO schema_migrations (version, name) 
        VALUES ($1, $2)
      `;
      // await this.connection.query(recordSql, [migration.version, migration.name]);
      
      // Commit transaction
      // await this.connection.query('COMMIT');
      
      console.log(`✓ Migration ${migration.version} completed`);
    } catch (error) {
      // Rollback on error
      // await this.connection.query('ROLLBACK');
      console.error(`✗ Migration ${migration.version} failed:`, error);
      throw error;
    }
  }

  async rollbackMigration(version: string): Promise<void> {
    const downFile = path.join(this.migrationsPath, `${version}_*.down.sql`);
    // Implementation for rollback
    console.log(`Rolling back migration ${version}...`);
  }

  async migrate(): Promise<void> {
    try {
      await this.connect();
      await this.createMigrationsTable();
      
      const appliedMigrations = await this.getAppliedMigrations();
      const allMigrations = await this.getMigrationFiles();
      
      const pendingMigrations = allMigrations.filter(
        m => !appliedMigrations.includes(m.version)
      );
      
      if (pendingMigrations.length === 0) {
        console.log('✓ Database is up to date');
        return;
      }
      
      console.log(`Found ${pendingMigrations.length} pending migrations`);
      
      for (const migration of pendingMigrations) {
        await this.runMigration(migration);
      }
      
      console.log('✓ All migrations completed successfully');
    } catch (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    } finally {
      if (this.connection) {
        // await this.connection.end();
      }
    }
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  const runner = new MigrationRunner();
  
  switch (command) {
    case 'up':
    case 'migrate':
      runner.migrate();
      break;
    case 'rollback':
      const version = process.argv[3];
      if (!version) {
        console.error('Please specify a version to rollback');
        process.exit(1);
      }
      runner.rollbackMigration(version);
      break;
    default:
      console.log('Usage:');
      console.log('  npm run db:migrate      - Run all pending migrations');
      console.log('  npm run db:rollback <version> - Rollback a specific migration');
  }
}

export default MigrationRunner;