import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { LibraryManagerService, AssetType, AssetFilter, UploadOptions } from '../../services/LibraryManagerService';
import { logger } from '../../logger';
import { 
  PathTraversalGuard, 
  validateRequest, 
  APIKeyValidator 
} from '../middleware/security';
import { ResponseFormatter } from '../utils/ResponseFormatter';
import { ValidationError, ProcessingError, NotFoundError } from '../errors/AppError';
import { asyncHandler } from '../middleware/errorHandler';
import Joi from 'joi';

// Validation schemas
const createCollectionSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  type: Joi.string().valid('music', 'overlay').required()
});

const updateAssetSchema = Joi.object({
  title: Joi.string().min(1).max(200).optional(),
  tags: Joi.array().items(Joi.string().max(50)).optional(),
  mood: Joi.string().optional() // For music assets
});

const assetFilterSchema = Joi.object({
  type: Joi.string().valid('music', 'overlay').optional(),
  mood: Joi.string().optional(),
  tags: Joi.string().optional(), // Comma-separated tags
  search: Joi.string().max(100).optional(),
  collection: Joi.string().optional()
});

// Configure multer for file uploads
const upload = multer({
  dest: path.join(process.cwd(), 'temp', 'uploads'),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
    files: 1 // Only one file at a time
  },
  fileFilter: (req, file, cb) => {
    const allowedMusicTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'];
    const allowedImageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    const allowedTypes = [...allowedMusicTypes, ...allowedImageTypes];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  }
});

export class LibraryRouter {
  public router = express.Router();
  private libraryManager: LibraryManagerService;
  private projectRoot: string;

  constructor(libraryManager: LibraryManagerService, projectRoot: string) {
    this.libraryManager = libraryManager;
    this.projectRoot = projectRoot;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Asset routes
    this.router.get('/assets', 
      validateRequest(assetFilterSchema),
      asyncHandler(this.getAssets.bind(this))
    );

    this.router.get('/assets/:id', 
      asyncHandler(this.getAsset.bind(this))
    );

    this.router.put('/assets/:id', 
      validateRequest(updateAssetSchema),
      asyncHandler(this.updateAsset.bind(this))
    );

    this.router.delete('/assets/:id', 
      asyncHandler(this.deleteAsset.bind(this))
    );

    this.router.post('/assets/upload',
      upload.single('file'),
      asyncHandler(this.uploadAsset.bind(this))
    );

    // Collection routes
    this.router.get('/collections', 
      asyncHandler(this.getCollections.bind(this))
    );

    this.router.post('/collections', 
      validateRequest(createCollectionSchema),
      asyncHandler(this.createCollection.bind(this))
    );

    this.router.post('/collections/:collectionId/assets/:assetId',
      asyncHandler(this.addAssetToCollection.bind(this))
    );

    this.router.delete('/collections/:collectionId/assets/:assetId',
      asyncHandler(this.removeAssetFromCollection.bind(this))
    );

    // Library statistics
    this.router.get('/stats', 
      asyncHandler(this.getLibraryStats.bind(this))
    );

    // Asset file serving
    this.router.get('/files/:type/:filename',
      asyncHandler(this.serveAssetFile.bind(this))
    );

    // Asset preview endpoints
    this.router.get('/preview/:id',
      asyncHandler(this.getAssetPreview.bind(this))
    );

    // Dynamic mood and tag endpoints
    this.router.get('/moods',
      asyncHandler(this.getAvailableMoods.bind(this))
    );

    this.router.get('/tags',
      asyncHandler(this.getAvailableTags.bind(this))
    );
  }

  /**
   * Get assets with filtering
   */
  private async getAssets(req: Request, res: Response): Promise<void> {
    try {
      const filter: AssetFilter = {
        type: req.query.type as AssetType,
        mood: req.query.mood as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        search: req.query.search as string,
        collection: req.query.collection as string
      };

      const assets = this.libraryManager.getAssets(filter);
      
      ResponseFormatter.success(res, {
        assets,
        total: assets.length,
        filter
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get assets');
      throw new ProcessingError('Failed to retrieve assets', undefined, 'asset_retrieval');
    }
  }

  /**
   * Get single asset by ID
   */
  private async getAsset(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    
    if (!id) {
      throw new ValidationError('Asset ID is required');
    }

    const asset = this.libraryManager.getAsset(id);
    
    if (!asset) {
      throw new NotFoundError('Asset', id);
    }

    ResponseFormatter.success(res, asset);
  }

  /**
   * Update asset metadata
   */
  private async updateAsset(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const updates = req.body;

    if (!id) {
      throw new ValidationError('Asset ID is required');
    }

    const updatedAsset = await this.libraryManager.updateAsset(id, updates);
    
    if (!updatedAsset) {
      throw new NotFoundError('Asset', id);
    }

    ResponseFormatter.success(res, updatedAsset);
  }

  /**
   * Delete asset
   */
  private async deleteAsset(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('Asset ID is required');
    }

    const deleted = await this.libraryManager.deleteAsset(id);
    
    if (!deleted) {
      throw new NotFoundError('Asset', id);
    }

    ResponseFormatter.success(res, { 
      message: 'Asset deleted successfully',
      assetId: id 
    });
  }

  /**
   * Upload new asset
   */
  private async uploadAsset(req: Request, res: Response): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        throw new ValidationError('No file uploaded');
      }

      // Determine asset type based on file type
      const isMusic = file.mimetype.startsWith('audio/');
      const isImage = file.mimetype.startsWith('image/');
      
      if (!isMusic && !isImage) {
        throw new ValidationError('Unsupported file type');
      }

      const type = isMusic ? AssetType.MUSIC : AssetType.OVERLAY;
      
      // Parse upload options from request body
      const options: UploadOptions = {
        title: req.body.title,
        tags: req.body.tags ? req.body.tags.split(',').map((t: string) => t.trim()) : undefined,
        mood: req.body.mood as any, // Allow any mood value for flexibility
        collection: req.body.collection
      };

      const asset = await this.libraryManager.uploadAsset(file, type, options);

      ResponseFormatter.success(res, {
        message: 'Asset uploaded successfully',
        asset
      }, 201);
    } catch (error) {
      logger.error({ error }, 'Failed to upload asset');
      throw new ProcessingError('Failed to upload asset', undefined, 'asset_upload');
    }
  }

  /**
   * Get collections
   */
  private async getCollections(req: Request, res: Response): Promise<void> {
    try {
      const type = req.query.type as AssetType;
      const collections = this.libraryManager.getCollections(type);
      
      ResponseFormatter.success(res, {
        collections,
        total: collections.length
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get collections');
      throw new ProcessingError('Failed to retrieve collections', undefined, 'collection_retrieval');
    }
  }

  /**
   * Create new collection
   */
  private async createCollection(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, type } = req.body;
      
      const collection = await this.libraryManager.createCollection(name, description, type);
      
      ResponseFormatter.success(res, {
        message: 'Collection created successfully',
        collection
      }, 201);
    } catch (error) {
      logger.error({ error }, 'Failed to create collection');
      throw new ProcessingError('Failed to create collection', undefined, 'collection_creation');
    }
  }

  /**
   * Add asset to collection
   */
  private async addAssetToCollection(req: Request, res: Response): Promise<void> {
    const { collectionId, assetId } = req.params;

    if (!collectionId || !assetId) {
      throw new ValidationError('Collection ID and Asset ID are required');
    }

    const success = await this.libraryManager.addAssetToCollection(assetId, collectionId);
    
    if (!success) {
      throw new NotFoundError('Collection or Asset', `${collectionId}/${assetId}`);
    }

    ResponseFormatter.success(res, {
      message: 'Asset added to collection successfully',
      collectionId,
      assetId
    });
  }

  /**
   * Remove asset from collection
   */
  private async removeAssetFromCollection(req: Request, res: Response): Promise<void> {
    const { collectionId, assetId } = req.params;

    if (!collectionId || !assetId) {
      throw new ValidationError('Collection ID and Asset ID are required');
    }

    const success = await this.libraryManager.removeAssetFromCollection(assetId, collectionId);
    
    if (!success) {
      throw new NotFoundError('Collection', collectionId);
    }

    ResponseFormatter.success(res, {
      message: 'Asset removed from collection successfully',
      collectionId,
      assetId
    });
  }

  /**
   * Get library statistics
   */
  private async getLibraryStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = this.libraryManager.getLibraryStats();
      ResponseFormatter.success(res, stats);
    } catch (error) {
      logger.error({ error }, 'Failed to get library stats');
      throw new ProcessingError('Failed to retrieve library statistics', undefined, 'stats_retrieval');
    }
  }

  /**
   * Serve asset files
   */
  private async serveAssetFile(req: Request, res: Response): Promise<void> {
    try {
      const { type, filename } = req.params;

      // Validate type
      if (!['music', 'overlay'].includes(type)) {
        throw new ValidationError('Invalid asset type');
      }

      // Validate filename to prevent path traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new ValidationError('Invalid filename');
      }

      const baseDir = type === 'music' 
        ? path.join(this.projectRoot, 'static', 'music')
        : path.join(this.projectRoot, 'static', 'overlays');
      
      const filePath = path.join(baseDir, filename);

      // Validate the full file path using PathTraversalGuard
      PathTraversalGuard.validatePath(filePath);

      // Check if file exists
      if (!await fs.pathExists(filePath)) {
        throw new NotFoundError('File', filename);
      }

      // Serve file with appropriate headers
      const stat = await fs.stat(filePath);
      const mimeType = this.getMimeType(path.extname(filename));

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Cache-Control', 'public, max-age=3600');

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (error) {
      logger.error({ error }, 'Failed to serve asset file');
      throw error;
    }
  }

  /**
   * Get asset preview information
   */
  private async getAssetPreview(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new ValidationError('Asset ID is required');
      }

      const asset = this.libraryManager.getAsset(id);
      
      if (!asset) {
        throw new NotFoundError('Asset', id);
      }

      // Generate preview URL
      const type = 'mood' in asset ? 'music' : 'overlay';
      const previewUrl = `/api/library/files/${type}/${asset.filename}`;

      ResponseFormatter.success(res, {
        asset,
        previewUrl,
        type
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get asset preview');
      throw new ProcessingError('Failed to generate asset preview', undefined, 'preview_generation');
    }
  }

  /**
   * Get available music moods
   */
  private async getAvailableMoods(req: Request, res: Response): Promise<void> {
    try {
      const moods = this.libraryManager.getAvailableMoods();
      
      ResponseFormatter.success(res, {
        moods,
        total: moods.length
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get available moods');
      throw new ProcessingError('Failed to retrieve available moods', undefined, 'moods_retrieval');
    }
  }

  /**
   * Get available tags
   */
  private async getAvailableTags(req: Request, res: Response): Promise<void> {
    try {
      const tags = this.libraryManager.getAvailableTags();
      
      ResponseFormatter.success(res, {
        tags,
        total: tags.length
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get available tags');
      throw new ProcessingError('Failed to retrieve available tags', undefined, 'tags_retrieval');
    }
  }

  /**
   * Get MIME type for file extension
   */
  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };

    return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
  }
}

// Export router factory function
export const createLibraryRouter = (libraryManager: LibraryManagerService, projectRoot: string) => {
  return new LibraryRouter(libraryManager, projectRoot).router;
};