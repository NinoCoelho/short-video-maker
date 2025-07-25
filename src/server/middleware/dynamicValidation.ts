import { Request, Response, NextFunction } from 'express';
import { ServiceContainer } from '../../services/ServiceContainer';
import { LibraryManagerService } from '../../services/LibraryManagerService';
import { logger } from '../../logger';

/**
 * Dynamic validation middleware that validates against actual library content
 */
export class DynamicValidation {
  private static libraryManager: LibraryManagerService | null = null;

  /**
   * Get or initialize the library manager service
   */
  private static getLibraryManager(): LibraryManagerService | null {
    if (!this.libraryManager) {
      try {
        const container = ServiceContainer.getInstance();
        this.libraryManager = container.get<LibraryManagerService>('libraryManager');
      } catch (error) {
        logger.warn('Failed to get LibraryManagerService for dynamic validation', error);
      }
    }
    return this.libraryManager;
  }

  /**
   * Validate music mood against available moods in the library
   */
  static validateMusicMood() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Only validate if music mood is provided
      if (req.body?.config?.music) {
        const requestedMood = req.body.config.music;
        const libraryManager = this.getLibraryManager();
        
        if (libraryManager) {
          try {
            const availableMoods = libraryManager.getAvailableMoods();
            
            if (!availableMoods.includes(requestedMood)) {
              logger.warn({ 
                requestedMood, 
                availableMoods 
              }, 'Invalid music mood requested');
              
              return res.status(400).json({
                error: 'Validation Error',
                message: `Invalid music mood: "${requestedMood}". Available moods: ${availableMoods.join(', ')}`,
                availableMoods
              });
            }
          } catch (error) {
            logger.error('Error validating music mood', error);
            // If validation fails, allow the request to proceed
            // Better to allow than to block due to validation error
          }
        }
      }
      
      next();
    };
  }

  /**
   * Validate that requested music files exist in the library
   */
  static validateMusicFile() {
    return (req: Request, res: Response, next: NextFunction) => {
      // This could be extended to validate specific music file IDs
      // For now, just proceed
      next();
    };
  }
}