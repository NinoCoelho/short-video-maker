import path from 'path';
import fs from 'fs-extra';
import { logger } from '../logger';
import { MusicMood, COMMON_MUSIC_MOODS } from '../types/shorts';

// Asset types supported by the library manager
export enum AssetType {
  MUSIC = 'music',
  OVERLAY = 'overlay'
}

// Music metadata interface
export interface MusicAsset {
  id: string;
  filename: string;
  title: string;
  duration: number;
  mood: MusicMood;
  tags: string[];
  fileSize: number;
  format: string;
  createdAt: Date;
  updatedAt: Date;
}

// Overlay metadata interface
export interface OverlayAsset {
  id: string;
  filename: string;
  title: string;
  dimensions: {
    width: number;
    height: number;
  };
  tags: string[];
  fileSize: number;
  format: string;
  createdAt: Date;
  updatedAt: Date;
}

// Generic asset interface
export type Asset = MusicAsset | OverlayAsset;

// Library collection interface
export interface LibraryCollection {
  id: string;
  name: string;
  description: string;
  type: AssetType;
  assetIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Asset filtering options
export interface AssetFilter {
  type?: AssetType;
  mood?: MusicMood;
  tags?: string[];
  search?: string;
  collection?: string;
}

// Upload options
export interface UploadOptions {
  title?: string;
  tags?: string[];
  mood?: MusicMood; // For music assets
  collection?: string;
}

/**
 * Library Manager Service
 * Manages music and overlay assets with metadata, collections, and file operations
 */
export class LibraryManagerService {
  private musicDir: string;
  private overlayDir: string;
  private metadataDir: string;
  private assets: Map<string, Asset> = new Map();
  private collections: Map<string, LibraryCollection> = new Map();

  private initialized = false;

  constructor(projectRoot: string) {
    this.musicDir = path.join(projectRoot, 'static', 'music');
    this.overlayDir = path.join(projectRoot, 'static', 'overlays');
    this.metadataDir = path.join(projectRoot, 'data', 'library');
  }

  /**
   * Initialize the library manager (must be called after construction)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.initializeDirectories();
      await this.loadMetadata();
      this.initialized = true;
      logger.info('LibraryManagerService initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize LibraryManagerService');
      throw error;
    }
  }

  /**
   * Ensure the service is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('LibraryManagerService not initialized. Call initialize() first.');
    }
  }

  /**
   * Initialize required directories
   */
  private async initializeDirectories(): Promise<void> {
    try {
      await fs.ensureDir(this.musicDir);
      await fs.ensureDir(this.overlayDir);
      await fs.ensureDir(this.metadataDir);
      logger.info('Library manager directories initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize library directories');
      throw error;
    }
  }

  /**
   * Load asset metadata from storage
   */
  private async loadMetadata(): Promise<void> {
    try {
      // Load assets metadata
      const assetsFile = path.join(this.metadataDir, 'assets.json');
      if (await fs.pathExists(assetsFile)) {
        const assetsData = await fs.readJson(assetsFile);
        this.assets = new Map(assetsData.map((asset: any) => [
          asset.id, 
          {
            ...asset,
            createdAt: new Date(asset.createdAt),
            updatedAt: new Date(asset.updatedAt)
          }
        ]));
      }

      // Load collections metadata
      const collectionsFile = path.join(this.metadataDir, 'collections.json');
      if (await fs.pathExists(collectionsFile)) {
        const collectionsData = await fs.readJson(collectionsFile);
        this.collections = new Map(collectionsData.map((collection: LibraryCollection) => [collection.id, collection]));
      }

      // Scan for new files not in metadata
      await this.scanForNewAssets();
      
      logger.info({ 
        assetsCount: this.assets.size, 
        collectionsCount: this.collections.size 
      }, 'Library metadata loaded');
    } catch (error) {
      logger.error({ error }, 'Failed to load library metadata');
    }
  }

  /**
   * Save metadata to storage
   */
  private async saveMetadata(): Promise<void> {
    try {
      const assetsFile = path.join(this.metadataDir, 'assets.json');
      const collectionsFile = path.join(this.metadataDir, 'collections.json');

      await fs.writeJson(assetsFile, Array.from(this.assets.values()), { spaces: 2 });
      await fs.writeJson(collectionsFile, Array.from(this.collections.values()), { spaces: 2 });
      
      logger.debug('Library metadata saved');
    } catch (error) {
      logger.error({ error }, 'Failed to save library metadata');
      throw error;
    }
  }

  /**
   * Scan directories for new assets not in metadata
   */
  private async scanForNewAssets(): Promise<void> {
    try {
      // Scan music directory
      const musicFiles = await fs.readdir(this.musicDir);
      for (const filename of musicFiles) {
        if (this.isMusicFile(filename) && !this.findAssetByFilename(filename)) {
          await this.addAssetFromFile(filename, AssetType.MUSIC);
        }
      }

      // Scan overlay directory
      const overlayFiles = await fs.readdir(this.overlayDir);
      for (const filename of overlayFiles) {
        if (this.isOverlayFile(filename) && !this.findAssetByFilename(filename)) {
          await this.addAssetFromFile(filename, AssetType.OVERLAY);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to scan for new assets');
    }
  }

  /**
   * Add asset from existing file
   */
  private async addAssetFromFile(filename: string, type: AssetType): Promise<void> {
    try {
      const filePath = type === AssetType.MUSIC 
        ? path.join(this.musicDir, filename)
        : path.join(this.overlayDir, filename);

      const stats = await fs.stat(filePath);
      const id = this.generateAssetId();
      
      if (type === AssetType.MUSIC) {
        const musicAsset: MusicAsset = {
          id,
          filename,
          title: path.parse(filename).name,
          duration: 0, // Will be detected later
          mood: 'happy', // Default mood
          tags: [],
          fileSize: stats.size,
          format: path.extname(filename).substring(1),
          createdAt: stats.birthtime,
          updatedAt: stats.mtime
        };
        this.assets.set(id, musicAsset);
      } else {
        const overlayAsset: OverlayAsset = {
          id,
          filename,
          title: path.parse(filename).name,
          dimensions: { width: 0, height: 0 }, // Will be detected later
          tags: [],
          fileSize: stats.size,
          format: path.extname(filename).substring(1),
          createdAt: stats.birthtime,
          updatedAt: stats.mtime
        };
        this.assets.set(id, overlayAsset);
      }

      logger.debug({ filename, type, id }, 'Added asset from existing file');
    } catch (error) {
      logger.error({ error, filename, type }, 'Failed to add asset from file');
    }
  }

  /**
   * Upload new asset
   */
  async uploadAsset(
    file: Express.Multer.File, 
    type: AssetType, 
    options: UploadOptions = {}
  ): Promise<Asset> {
    this.ensureInitialized();
    try {
      const id = this.generateAssetId();
      const targetDir = type === AssetType.MUSIC ? this.musicDir : this.overlayDir;
      const filename = this.generateUniqueFilename(file.originalname, targetDir);
      const filePath = path.join(targetDir, filename);

      // Move uploaded file to target directory
      await fs.move(file.path, filePath);

      // Create asset metadata
      const baseAsset = {
        id,
        filename,
        title: options.title || path.parse(filename).name,
        tags: options.tags || [],
        fileSize: file.size,
        format: path.extname(filename).substring(1),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      let asset: Asset;
      if (type === AssetType.MUSIC) {
        asset = {
          ...baseAsset,
          duration: 0, // Will be detected
          mood: options.mood || 'happy'
        } as MusicAsset;
      } else {
        asset = {
          ...baseAsset,
          dimensions: { width: 0, height: 0 } // Will be detected
        } as OverlayAsset;
      }

      this.assets.set(id, asset);

      // Add to collection if specified
      if (options.collection) {
        await this.addAssetToCollection(id, options.collection);
      }

      await this.saveMetadata();
      
      logger.info({ id, filename, type }, 'Asset uploaded successfully');
      return asset;
    } catch (error) {
      logger.error({ error }, 'Failed to upload asset');
      throw error;
    }
  }

  /**
   * Get all assets with optional filtering
   */
  getAssets(filter: AssetFilter = {}): Asset[] {
    this.ensureInitialized();
    let assets = Array.from(this.assets.values());

    // Filter by type
    if (filter.type) {
      assets = assets.filter(asset => {
        if (filter.type === AssetType.MUSIC) {
          return 'mood' in asset;
        } else {
          return 'dimensions' in asset;
        }
      });
    }

    // Filter by mood (music only)
    if (filter.mood && filter.type === AssetType.MUSIC) {
      assets = assets.filter(asset => 
        'mood' in asset && asset.mood === filter.mood
      );
    }

    // Filter by tags
    if (filter.tags && filter.tags.length > 0) {
      assets = assets.filter(asset =>
        filter.tags!.some(tag => asset.tags.includes(tag))
      );
    }

    // Filter by search term
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      assets = assets.filter(asset =>
        asset.title.toLowerCase().includes(searchLower) ||
        asset.filename.toLowerCase().includes(searchLower) ||
        asset.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    // Filter by collection
    if (filter.collection) {
      const collection = this.collections.get(filter.collection);
      if (collection) {
        assets = assets.filter(asset => collection.assetIds.includes(asset.id));
      }
    }

    return assets;
  }

  /**
   * Get asset by ID
   */
  getAsset(id: string): Asset | undefined {
    this.ensureInitialized();
    return this.assets.get(id);
  }

  /**
   * Update asset metadata
   */
  async updateAsset(id: string, updates: Partial<Asset>): Promise<Asset | null> {
    this.ensureInitialized();
    try {
      const asset = this.assets.get(id);
      if (!asset) {
        return null;
      }

      const updatedAsset = {
        ...asset,
        ...updates,
        id, // Prevent ID changes
        updatedAt: new Date()
      };

      this.assets.set(id, updatedAsset);
      await this.saveMetadata();

      logger.info({ id, updates }, 'Asset updated');
      return updatedAsset;
    } catch (error) {
      logger.error({ error, id }, 'Failed to update asset');
      throw error;
    }
  }

  /**
   * Delete asset
   */
  async deleteAsset(id: string): Promise<boolean> {
    this.ensureInitialized();
    try {
      const asset = this.assets.get(id);
      if (!asset) {
        return false;
      }

      // Remove file
      const filePath = 'mood' in asset 
        ? path.join(this.musicDir, asset.filename)
        : path.join(this.overlayDir, asset.filename);

      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
      }

      // Remove from collections
      for (const collection of this.collections.values()) {
        const index = collection.assetIds.indexOf(id);
        if (index > -1) {
          collection.assetIds.splice(index, 1);
        }
      }

      // Remove asset metadata
      this.assets.delete(id);
      await this.saveMetadata();

      logger.info({ id, filename: asset.filename }, 'Asset deleted');
      return true;
    } catch (error) {
      logger.error({ error, id }, 'Failed to delete asset');
      throw error;
    }
  }

  /**
   * Create new collection
   */
  async createCollection(name: string, description: string, type: AssetType): Promise<LibraryCollection> {
    this.ensureInitialized();
    try {
      const id = this.generateCollectionId();
      const collection: LibraryCollection = {
        id,
        name,
        description,
        type,
        assetIds: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.collections.set(id, collection);
      await this.saveMetadata();

      logger.info({ id, name, type }, 'Collection created');
      return collection;
    } catch (error) {
      logger.error({ error, name }, 'Failed to create collection');
      throw error;
    }
  }

  /**
   * Get all collections
   */
  getCollections(type?: AssetType): LibraryCollection[] {
    this.ensureInitialized();
    const collections = Array.from(this.collections.values());
    return type ? collections.filter(c => c.type === type) : collections;
  }

  /**
   * Add asset to collection
   */
  async addAssetToCollection(assetId: string, collectionId: string): Promise<boolean> {
    this.ensureInitialized();
    try {
      const collection = this.collections.get(collectionId);
      const asset = this.assets.get(assetId);

      if (!collection || !asset) {
        return false;
      }

      if (!collection.assetIds.includes(assetId)) {
        collection.assetIds.push(assetId);
        collection.updatedAt = new Date();
        await this.saveMetadata();
      }

      return true;
    } catch (error) {
      logger.error({ error, assetId, collectionId }, 'Failed to add asset to collection');
      return false;
    }
  }

  /**
   * Remove asset from collection
   */
  async removeAssetFromCollection(assetId: string, collectionId: string): Promise<boolean> {
    this.ensureInitialized();
    try {
      const collection = this.collections.get(collectionId);
      if (!collection) {
        return false;
      }

      const index = collection.assetIds.indexOf(assetId);
      if (index > -1) {
        collection.assetIds.splice(index, 1);
        collection.updatedAt = new Date();
        await this.saveMetadata();
      }

      return true;
    } catch (error) {
      logger.error({ error, assetId, collectionId }, 'Failed to remove asset from collection');
      return false;
    }
  }

  /**
   * Get library statistics
   */
  getLibraryStats() {
    this.ensureInitialized();
    const assets = Array.from(this.assets.values());
    const musicAssets = assets.filter(a => 'mood' in a);
    const overlayAssets = assets.filter(a => 'dimensions' in a);

    return {
      totalAssets: assets.length,
      musicAssets: musicAssets.length,
      overlayAssets: overlayAssets.length,
      collections: this.collections.size,
      totalSize: assets.reduce((sum, asset) => sum + asset.fileSize, 0),
      musicMoods: this.getMoodDistribution(musicAssets as MusicAsset[]),
      allTags: this.getAllTags()
    };
  }

  // Helper methods
  private findAssetByFilename(filename: string): Asset | undefined {
    return Array.from(this.assets.values()).find(asset => asset.filename === filename);
  }

  private isMusicFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ['.mp3', '.wav', '.ogg', '.m4a'].includes(ext);
  }

  private isOverlayFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext);
  }

  private generateAssetId(): string {
    return `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCollectionId(): string {
    return `collection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateUniqueFilename(originalName: string, targetDir: string): string {
    const ext = path.extname(originalName);
    const base = path.parse(originalName).name;
    let filename = originalName;
    let counter = 1;

    while (fs.existsSync(path.join(targetDir, filename))) {
      filename = `${base}_${counter}${ext}`;
      counter++;
    }

    return filename;
  }

  private getMoodDistribution(musicAssets: MusicAsset[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    for (const asset of musicAssets) {
      distribution[asset.mood] = (distribution[asset.mood] || 0) + 1;
    }
    return distribution;
  }

  private getAllTags(): string[] {
    const tags = new Set<string>();
    for (const asset of this.assets.values()) {
      asset.tags.forEach(tag => tags.add(tag));
    }
    return Array.from(tags).sort();
  }

  /**
   * Get all available music moods from the library
   */
  getAvailableMoods(): string[] {
    this.ensureInitialized();
    const moods = new Set<string>();
    
    // Add moods from existing music assets
    for (const asset of this.assets.values()) {
      if ('mood' in asset && asset.mood) {
        moods.add(asset.mood);
      }
    }
    
    // Ensure common moods are always available
    COMMON_MUSIC_MOODS.forEach(mood => moods.add(mood));
    
    return Array.from(moods).sort();
  }

  /**
   * Get all available tags from the library
   */
  getAvailableTags(): string[] {
    this.ensureInitialized();
    return this.getAllTags();
  }
}