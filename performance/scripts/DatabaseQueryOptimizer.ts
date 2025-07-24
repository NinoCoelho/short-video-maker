import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

interface QueryLog {
  id: string;
  timestamp: number;
  query: string;
  duration: number;
  rows: number;
  cached: boolean;
  error?: string;
  plan?: QueryPlan;
  stackTrace?: string;
}

interface QueryPlan {
  operation: string;
  cost: number;
  rows: number;
  filtered?: number;
  indexUsed?: string;
  children?: QueryPlan[];
}

interface QueryAnalysis {
  query: string;
  normalizedQuery: string;
  frequency: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  errorRate: number;
  cacheHitRate: number;
  optimization: {
    severity: 'low' | 'medium' | 'high' | 'critical';
    issues: string[];
    suggestions: string[];
    estimatedImprovement: number; // percentage
  };
}

interface IndexSuggestion {
  table: string;
  columns: string[];
  type: 'btree' | 'hash' | 'partial' | 'unique';
  reason: string;
  estimatedImprovement: number;
  cost: 'low' | 'medium' | 'high';
  queries: string[];
}

interface DatabaseStats {
  totalQueries: number;
  slowQueries: number;
  averageQueryTime: number;
  cacheHitRate: number;
  mostExpensiveQueries: QueryAnalysis[];
  indexSuggestions: IndexSuggestion[];
  tableStats: Map<string, {
    queryCount: number;
    avgTime: number;
    needsOptimization: boolean;
  }>;
}

export class DatabaseQueryOptimizer extends EventEmitter {
  private queryLogs: QueryLog[] = [];
  private queryAnalyses = new Map<string, QueryAnalysis>();
  private indexSuggestions: IndexSuggestion[] = [];
  private readonly maxLogs = 50000;
  
  constructor(
    private options = {
      slowQueryThreshold: 1000, // 1 second
      frequentQueryThreshold: 10, // queries that appear 10+ times
      outputPath: 'performance/reports',
      enableQueryPlan: true,
      enableStackTrace: false
    }
  ) {
    super();
  }

  recordQuery(log: Omit<QueryLog, 'id' | 'timestamp'>): void {
    const queryLog: QueryLog = {
      id: `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...log
    };

    this.queryLogs.push(queryLog);
    
    // Keep only recent logs
    if (this.queryLogs.length > this.maxLogs) {
      this.queryLogs.shift();
    }

    this.emit('query_logged', queryLog);

    // Immediate alerts for very slow queries
    if (queryLog.duration > this.options.slowQueryThreshold * 5) { // 5x threshold
      this.emit('very_slow_query', queryLog);
    }

    // Update analysis
    this.updateQueryAnalysis(queryLog);
  }

  private updateQueryAnalysis(log: QueryLog): void {
    const normalizedQuery = this.normalizeQuery(log.query);
    
    let analysis = this.queryAnalyses.get(normalizedQuery);
    if (!analysis) {
      analysis = {
        query: log.query,
        normalizedQuery,
        frequency: 0,
        totalTime: 0,
        averageTime: 0,
        minTime: Infinity,
        maxTime: 0,
        errorRate: 0,
        cacheHitRate: 0,
        optimization: {
          severity: 'low',
          issues: [],
          suggestions: [],
          estimatedImprovement: 0
        }
      };
      this.queryAnalyses.set(normalizedQuery, analysis);
    }

    // Update statistics
    analysis.frequency++;
    analysis.totalTime += log.duration;
    analysis.averageTime = analysis.totalTime / analysis.frequency;
    analysis.minTime = Math.min(analysis.minTime, log.duration);
    analysis.maxTime = Math.max(analysis.maxTime, log.duration);
    
    // Update error rate
    if (log.error) {
      const errorQueries = this.queryLogs.filter(q => 
        this.normalizeQuery(q.query) === normalizedQuery && q.error
      );
      analysis.errorRate = errorQueries.length / analysis.frequency;
    }

    // Update cache hit rate
    const cachedQueries = this.queryLogs.filter(q => 
      this.normalizeQuery(q.query) === normalizedQuery && q.cached
    );
    analysis.cacheHitRate = cachedQueries.length / analysis.frequency;

    // Analyze optimization opportunities
    this.analyzeOptimizationOpportunities(analysis, log);
  }

  private normalizeQuery(query: string): string {
    return query
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\d+/g, '?') // Replace numbers with placeholders
      .replace(/'[^']*'/g, '?') // Replace string literals
      .replace(/"/[^"]*"/g, '?') // Replace quoted strings
      .trim()
      .toLowerCase();
  }

  private analyzeOptimizationOpportunities(analysis: QueryAnalysis, log: QueryLog): void {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let severity: QueryAnalysis['optimization']['severity'] = 'low';
    let estimatedImprovement = 0;

    // Check for slow queries
    if (analysis.averageTime > this.options.slowQueryThreshold) {
      issues.push(`Average execution time is ${analysis.averageTime.toFixed(2)}ms`);
      suggestions.push('Consider adding appropriate indexes');
      suggestions.push('Review query structure and joins');
      severity = 'high';
      estimatedImprovement += 40;
    }

    // Check for frequent queries
    if (analysis.frequency > this.options.frequentQueryThreshold) {
      if (analysis.cacheHitRate < 0.5) {
        issues.push('Frequent query with low cache hit rate');
        suggestions.push('Implement query result caching');
        estimatedImprovement += 30;
      }
    }

    // Check for full table scans (if plan is available)
    if (log.plan && this.containsFullTableScan(log.plan)) {
      issues.push('Query performs full table scan');
      suggestions.push('Add index on filtered columns');
      severity = severity === 'low' ? 'medium' : severity;
      estimatedImprovement += 50;
    }

    // Check for N+1 queries
    if (this.isLikelyNPlusOne(analysis)) {
      issues.push('Potential N+1 query pattern detected');
      suggestions.push('Consider using JOINs or batch queries');
      severity = 'high';
      estimatedImprovement += 60;
    }

    // Check for large result sets
    if (log.rows > 10000) {
      issues.push(`Query returns ${log.rows} rows`);
      suggestions.push('Consider pagination or result limiting');
      suggestions.push('Add appropriate WHERE clauses');
      severity = severity === 'low' ? 'medium' : severity;
      estimatedImprovement += 25;
    }

    // Check for inefficient JOINs
    if (this.hasInefficientsJoins(analysis.query)) {
      issues.push('Query contains potentially inefficient JOINs');
      suggestions.push('Optimize JOIN conditions and order');
      suggestions.push('Ensure proper indexes on JOIN columns');
      severity = severity === 'low' ? 'medium' : severity;
      estimatedImprovement += 35;
    }

    // Check for subqueries that could be optimized
    if (this.hasOptimizableSubqueries(analysis.query)) {
      issues.push('Query contains subqueries that could be optimized');
      suggestions.push('Consider rewriting subqueries as JOINs');
      suggestions.push('Use EXISTS instead of IN for subqueries');
      estimatedImprovement += 30;
    }

    // Update analysis
    analysis.optimization = {
      severity,
      issues,
      suggestions: [...new Set(suggestions)], // Remove duplicates
      estimatedImprovement: Math.min(estimatedImprovement, 90) // Cap at 90%
    };
  }

  private containsFullTableScan(plan: QueryPlan): boolean {
    if (plan.operation.toLowerCase().includes('scan') && !plan.indexUsed) {
      return true;
    }
    
    if (plan.children) {
      return plan.children.some(child => this.containsFullTableScan(child));
    }
    
    return false;
  }

  private isLikelyNPlusOne(analysis: QueryAnalysis): boolean {
    // Check if this query is executed very frequently in a short time
    const recentQueries = this.queryLogs
      .filter(log => this.normalizeQuery(log.query) === analysis.normalizedQuery)
      .filter(log => Date.now() - log.timestamp < 5000) // Last 5 seconds
      .length;

    return recentQueries > 20; // More than 20 similar queries in 5 seconds
  }

  private hasInefficientsJoins(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    
    // Check for Cartesian products (JOIN without ON clause)
    if (lowerQuery.includes('join') && !lowerQuery.includes(' on ')) {
      return true;
    }
    
    // Check for multiple JOINs which might be inefficient
    const joinCount = (lowerQuery.match(/join/g) || []).length;
    return joinCount > 3;
  }

  private hasOptimizableSubqueries(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    
    // Check for IN with subqueries
    if (lowerQuery.includes(' in (select')) {
      return true;
    }
    
    // Check for correlated subqueries
    if (lowerQuery.includes('where exists')) {
      return false; // EXISTS is usually good
    }
    
    return lowerQuery.includes('(select') && lowerQuery.split('(select').length > 2;
  }

  generateIndexSuggestions(): IndexSuggestion[] {
    const suggestions: IndexSuggestion[] = [];
    const tableColumns = new Map<string, Set<string>>();

    // Analyze queries to find potential index opportunities
    for (const analysis of this.queryAnalyses.values()) {
      if (analysis.optimization.severity === 'low') continue;

      const tables = this.extractTablesFromQuery(analysis.query);
      const columns = this.extractColumnsFromQuery(analysis.query);
      
      for (const table of tables) {
        if (!tableColumns.has(table)) {
          tableColumns.set(table, new Set());
        }
        
        columns.forEach(col => tableColumns.get(table)!.add(col));
      }

      // Generate suggestions based on WHERE clauses
      const whereColumns = this.extractWhereColumns(analysis.query);
      if (whereColumns.length > 0) {
        const table = tables[0]; // Primary table
        
        suggestions.push({
          table,
          columns: whereColumns,
          type: whereColumns.length > 1 ? 'btree' : 'btree',
          reason: `Optimize WHERE clause filtering (${analysis.frequency} executions, avg ${analysis.averageTime.toFixed(2)}ms)`,
          estimatedImprovement: analysis.optimization.estimatedImprovement,
          cost: whereColumns.length > 3 ? 'high' : 'medium',
          queries: [analysis.normalizedQuery]
        });
      }

      // Generate suggestions for JOIN columns
      const joinColumns = this.extractJoinColumns(analysis.query);
      if (joinColumns.length > 0) {
        for (const { table, column } of joinColumns) {
          suggestions.push({
            table,
            columns: [column],
            type: 'btree',
            reason: `Optimize JOIN operations`,
            estimatedImprovement: 40,
            cost: 'medium',
            queries: [analysis.normalizedQuery]
          });
        }
      }
    }

    // Remove duplicates and consolidate
    this.indexSuggestions = this.consolidateIndexSuggestions(suggestions);
    return this.indexSuggestions;
  }

  private extractTablesFromQuery(query: string): string[] {
    const tables: string[] = [];
    const lowerQuery = query.toLowerCase();
    
    // Extract from FROM clause
    const fromMatch = lowerQuery.match(/from\s+(\w+)/);
    if (fromMatch) {
      tables.push(fromMatch[1]);
    }
    
    // Extract from JOIN clauses
    const joinMatches = lowerQuery.matchAll(/join\s+(\w+)/g);
    for (const match of joinMatches) {
      tables.push(match[1]);
    }
    
    return tables;
  }

  private extractColumnsFromQuery(query: string): string[] {
    const columns: string[] = [];
    const lowerQuery = query.toLowerCase();
    
    // Simple extraction - could be improved with proper SQL parsing
    const selectMatch = lowerQuery.match(/select\s+(.*?)\s+from/);
    if (selectMatch && selectMatch[1] !== '*') {
      const selectColumns = selectMatch[1].split(',').map(col => col.trim());
      columns.push(...selectColumns);
    }
    
    return columns;
  }

  private extractWhereColumns(query: string): string[] {
    const columns: string[] = [];
    const lowerQuery = query.toLowerCase();
    
    // Extract columns from WHERE clause
    const whereMatch = lowerQuery.match(/where\s+(.*?)(?:\s+group\s+by|\s+order\s+by|\s+limit|$)/);
    if (whereMatch) {
      const whereClause = whereMatch[1];
      
      // Simple pattern matching for column names
      const columnMatches = whereClause.matchAll(/(\w+)\s*[=<>]/g);
      for (const match of columnMatches) {
        columns.push(match[1]);
      }
    }
    
    return columns;
  }

  private extractJoinColumns(query: string): Array<{ table: string; column: string }> {
    const joinColumns: Array<{ table: string; column: string }> = [];
    const lowerQuery = query.toLowerCase();
    
    // Extract JOIN conditions
    const joinMatches = lowerQuery.matchAll(/join\s+(\w+)\s+(?:as\s+\w+\s+)?on\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/g);
    for (const match of joinMatches) {
      const [, table, leftTable, leftCol, rightTable, rightCol] = match;
      joinColumns.push({ table: leftTable, column: leftCol });
      joinColumns.push({ table: rightTable, column: rightCol });
    }
    
    return joinColumns;
  }

  private consolidateIndexSuggestions(suggestions: IndexSuggestion[]): IndexSuggestion[] {
    const consolidated = new Map<string, IndexSuggestion>();
    
    for (const suggestion of suggestions) {
      const key = `${suggestion.table}_${suggestion.columns.sort().join('_')}`;
      
      if (consolidated.has(key)) {
        const existing = consolidated.get(key)!;
        existing.queries.push(...suggestion.queries);
        existing.estimatedImprovement = Math.max(existing.estimatedImprovement, suggestion.estimatedImprovement);
      } else {
        consolidated.set(key, { ...suggestion, queries: [...suggestion.queries] });
      }
    }
    
    return Array.from(consolidated.values())
      .sort((a, b) => b.estimatedImprovement - a.estimatedImprovement);
  }

  getStats(): DatabaseStats {
    const slowQueries = this.queryLogs.filter(q => q.duration > this.options.slowQueryThreshold);
    const cachedQueries = this.queryLogs.filter(q => q.cached);
    
    const mostExpensiveQueries = Array.from(this.queryAnalyses.values())
      .filter(a => a.optimization.severity !== 'low')
      .sort((a, b) => b.averageTime - a.averageTime)
      .slice(0, 20);

    const tableStats = new Map();
    for (const analysis of this.queryAnalyses.values()) {
      const tables = this.extractTablesFromQuery(analysis.query);
      for (const table of tables) {
        if (!tableStats.has(table)) {
          tableStats.set(table, {
            queryCount: 0,
            avgTime: 0,
            totalTime: 0,
            needsOptimization: false
          });
        }
        
        const stats = tableStats.get(table);
        stats.queryCount += analysis.frequency;
        stats.totalTime += analysis.totalTime;
        stats.avgTime = stats.totalTime / stats.queryCount;
        stats.needsOptimization = stats.needsOptimization || analysis.optimization.severity !== 'low';
      }
    }

    return {
      totalQueries: this.queryLogs.length,
      slowQueries: slowQueries.length,
      averageQueryTime: this.queryLogs.reduce((sum, q) => sum + q.duration, 0) / this.queryLogs.length,
      cacheHitRate: cachedQueries.length / this.queryLogs.length,
      mostExpensiveQueries,
      indexSuggestions: this.generateIndexSuggestions(),
      tableStats
    };
  }

  async generateOptimizationReport(): Promise<string> {
    const stats = this.getStats();
    const topSlowQueries = Array.from(this.queryAnalyses.values())
      .sort((a, b) => b.averageTime - a.averageTime)
      .slice(0, 10);

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalQueries: stats.totalQueries,
        slowQueries: stats.slowQueries,
        averageQueryTime: `${stats.averageQueryTime.toFixed(2)}ms`,
        cacheHitRate: `${(stats.cacheHitRate * 100).toFixed(2)}%`,
        tablesNeedingOptimization: Array.from(stats.tableStats.entries())
          .filter(([, stats]) => stats.needsOptimization)
          .map(([table]) => table)
      },
      topSlowQueries: topSlowQueries.map(analysis => ({
        query: analysis.normalizedQuery,
        frequency: analysis.frequency,
        averageTime: `${analysis.averageTime.toFixed(2)}ms`,
        severity: analysis.optimization.severity,
        issues: analysis.optimization.issues,
        suggestions: analysis.optimization.suggestions,
        estimatedImprovement: `${analysis.optimization.estimatedImprovement}%`
      })),
      indexSuggestions: stats.indexSuggestions.map(suggestion => ({
        table: suggestion.table,
        columns: suggestion.columns,
        type: suggestion.type,
        reason: suggestion.reason,
        estimatedImprovement: `${suggestion.estimatedImprovement}%`,
        implementationCost: suggestion.cost,
        sqlCommand: this.generateIndexSQL(suggestion)
      })),
      tableStats: Object.fromEntries(
        Array.from(stats.tableStats.entries()).map(([table, stats]) => [
          table,
          {
            queryCount: stats.queryCount,
            averageTime: `${stats.avgTime.toFixed(2)}ms`,
            needsOptimization: stats.needsOptimization
          }
        ])
      ),
      recommendations: this.generateOptimizationRecommendations(stats)
    };

    const reportPath = path.join(this.options.outputPath, `database-optimization-report-${Date.now()}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return reportPath;
  }

  private generateIndexSQL(suggestion: IndexSuggestion): string {
    const indexName = `idx_${suggestion.table}_${suggestion.columns.join('_')}`;
    const columns = suggestion.columns.join(', ');
    
    switch (suggestion.type) {
      case 'unique':
        return `CREATE UNIQUE INDEX ${indexName} ON ${suggestion.table} (${columns});`;
      case 'partial':
        return `CREATE INDEX ${indexName} ON ${suggestion.table} (${columns}) WHERE /* add condition */;`;
      case 'hash':
        return `CREATE INDEX ${indexName} ON ${suggestion.table} USING HASH (${columns});`;
      default:
        return `CREATE INDEX ${indexName} ON ${suggestion.table} (${columns});`;
    }
  }

  private generateOptimizationRecommendations(stats: DatabaseStats): string[] {
    const recommendations: string[] = [];

    if (stats.slowQueries > stats.totalQueries * 0.1) {
      recommendations.push('High number of slow queries detected - review and optimize query performance');
    }

    if (stats.cacheHitRate < 0.5) {
      recommendations.push('Low cache hit rate - implement query result caching');
    }

    if (stats.averageQueryTime > 500) {
      recommendations.push('High average query time - implement suggested indexes and optimize queries');
    }

    if (stats.indexSuggestions.length > 0) {
      recommendations.push(`${stats.indexSuggestions.length} index suggestions available - implement high-impact indexes first`);
    }

    const highImpactSuggestions = stats.indexSuggestions.filter(s => s.estimatedImprovement > 50);
    if (highImpactSuggestions.length > 0) {
      recommendations.push('High-impact optimization opportunities available - prioritize these changes');
    }

    return recommendations;
  }

  // Create a query interceptor for common database libraries
  createQueryInterceptor() {
    const self = this;
    
    return {
      // For MySQL/PostgreSQL drivers
      interceptQuery(originalQuery: Function) {
        return function(query: string, params?: any, callback?: Function) {
          const startTime = Date.now();
          
          // Handle different callback patterns
          const wrappedCallback = (error: any, results: any, fields?: any) => {
            const duration = Date.now() - startTime;
            
            self.recordQuery({
              query,
              duration,
              rows: Array.isArray(results) ? results.length : 0,
              cached: false, // Would need to be determined by the specific driver
              error: error ? error.message : undefined,
              stackTrace: self.options.enableStackTrace ? new Error().stack : undefined
            });
            
            if (callback) callback(error, results, fields);
          };
          
          if (typeof params === 'function') {
            return originalQuery.call(this, query, wrappedCallback);
          } else {
            return originalQuery.call(this, query, params, wrappedCallback);
          }
        };
      },

      // For Sequelize ORM
      interceptSequelize(sequelize: any) {
        const originalQuery = sequelize.query;
        
        sequelize.query = function(sql: string, options: any = {}) {
          const startTime = Date.now();
          
          return originalQuery.call(this, sql, options).then((results: any) => {
            const duration = Date.now() - startTime;
            
            self.recordQuery({
              query: sql,
              duration,
              rows: Array.isArray(results[0]) ? results[0].length : 0,
              cached: false
            });
            
            return results;
          }).catch((error: any) => {
            const duration = Date.now() - startTime;
            
            self.recordQuery({
              query: sql,
              duration,
              rows: 0,
              cached: false,
              error: error.message
            });
            
            throw error;
          });
        };
      }
    };
  }

  clearLogs(): void {
    this.queryLogs = [];
    this.queryAnalyses.clear();
    this.indexSuggestions = [];
  }

  getQueryAnalyses(): QueryAnalysis[] {
    return Array.from(this.queryAnalyses.values());
  }

  getSlowQueries(limit: number = 50): QueryLog[] {
    return this.queryLogs
      .filter(q => q.duration > this.options.slowQueryThreshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }
}