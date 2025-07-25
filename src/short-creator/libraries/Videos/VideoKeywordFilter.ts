import { Video } from '../../../types/shorts';
import { logger } from '../../../logger';

export class VideoKeywordFilter {
  private negativeKeywords: Set<string>;
  
  constructor(negativeKeywords: string[] = []) {
    this.negativeKeywords = new Set(
      negativeKeywords.map(keyword => keyword.toLowerCase().trim())
    );
    
    this.addDefaultNegativeKeywords();
  }

  private addDefaultNegativeKeywords(): void {
    const defaults = [
      'violence', 'violent', 'gore', 'blood', 'bloody',
      'explicit', 'nsfw', 'nude', 'nudity', 'naked',
      'weapon', 'gun', 'guns', 'knife', 'sword',
      'death', 'dead', 'dying', 'kill', 'murder',
      'accident', 'crash', 'injury', 'injured',
      'drug', 'drugs', 'alcohol', 'smoking',
      'offensive', 'hate', 'racist', 'sexist',
      'profanity', 'obscene', 'vulgar'
    ];
    
    defaults.forEach(keyword => this.negativeKeywords.add(keyword));
  }

  addNegativeKeywords(keywords: string[]): void {
    keywords.forEach(keyword => 
      this.negativeKeywords.add(keyword.toLowerCase().trim())
    );
    
    logger.info({ count: keywords.length }, "Added negative keywords");
  }

  removeNegativeKeywords(keywords: string[]): void {
    keywords.forEach(keyword => 
      this.negativeKeywords.delete(keyword.toLowerCase().trim())
    );
    
    logger.info({ count: keywords.length }, "Removed negative keywords");
  }

  getNegativeKeywords(): string[] {
    return Array.from(this.negativeKeywords);
  }

  isSearchTermSafe(searchTerm: string): boolean {
    const lowerTerm = searchTerm.toLowerCase();
    
    for (const negativeKeyword of this.negativeKeywords) {
      if (lowerTerm.includes(negativeKeyword)) {
        logger.warn({ searchTerm, blockedBy: negativeKeyword }, "Search term blocked by negative keyword");
        return false;
      }
    }
    
    return true;
  }

  filterSearchTerms(searchTerms: string[]): string[] {
    const originalCount = searchTerms.length;
    const filteredTerms = searchTerms.filter(term => this.isSearchTermSafe(term));
    const blockedCount = originalCount - filteredTerms.length;
    
    logger.info({ 
      originalTerms: searchTerms,
      filteredTerms,
      originalCount, 
      filteredCount: filteredTerms.length,
      blockedCount,
      negativeKeywordsActive: this.negativeKeywords.size
    }, "Search terms filtering completed");
    
    // If ALL terms are blocked, this is likely a configuration issue
    // Log a warning and provide debugging information
    if (filteredTerms.length === 0 && originalCount > 0) {
      logger.warn({ 
        originalTerms: searchTerms,
        activeNegativeKeywords: Array.from(this.negativeKeywords),
        message: "All search terms were blocked by negative keyword filter - this may indicate overly restrictive filtering"
      }, "All search terms blocked - potential configuration issue");
    }
    
    return filteredTerms;
  }

  isVideoSafe(video: Video, metadata?: { title?: string; tags?: string[]; description?: string }): boolean {
    if (!metadata) {
      return true;
    }

    const checkText = (text: string | undefined): boolean => {
      if (!text) return true;
      
      const lowerText = text.toLowerCase();
      for (const negativeKeyword of this.negativeKeywords) {
        if (lowerText.includes(negativeKeyword)) {
          logger.warn({ 
            videoId: video.id, 
            blockedBy: negativeKeyword,
            inField: 'text'
          }, "Video blocked by negative keyword");
          return false;
        }
      }
      return true;
    };

    if (!checkText(metadata.title)) return false;
    if (!checkText(metadata.description)) return false;
    
    if (metadata.tags) {
      for (const tag of metadata.tags) {
        if (!checkText(tag)) return false;
      }
    }

    return true;
  }

  filterVideos<T extends Video>(
    videos: T[], 
    metadataMap?: Map<string, { title?: string; tags?: string[]; description?: string }>
  ): T[] {
    if (!metadataMap || metadataMap.size === 0) {
      return videos;
    }

    return videos.filter(video => {
      const metadata = metadataMap.get(video.id);
      return this.isVideoSafe(video, metadata);
    });
  }

  sanitizeSearchQuery(query: string): string {
    let sanitized = query;
    
    for (const negativeKeyword of this.negativeKeywords) {
      const regex = new RegExp(`\\b${negativeKeyword}\\b`, 'gi');
      sanitized = sanitized.replace(regex, '');
    }
    
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    if (sanitized !== query) {
      logger.info({ original: query, sanitized }, "Search query sanitized");
    }
    
    return sanitized || 'nature landscape';
  }

  getFilterStats(): {
    totalNegativeKeywords: number;
    categories: {
      violence: number;
      explicit: number;
      offensive: number;
      other: number;
    };
  } {
    const categories = {
      violence: 0,
      explicit: 0,
      offensive: 0,
      other: 0,
    };

    const violenceKeywords = ['violence', 'violent', 'gore', 'blood', 'weapon', 'gun', 'death', 'kill', 'murder'];
    const explicitKeywords = ['explicit', 'nsfw', 'nude', 'nudity', 'naked'];
    const offensiveKeywords = ['offensive', 'hate', 'racist', 'sexist', 'profanity', 'obscene', 'vulgar'];

    for (const keyword of this.negativeKeywords) {
      if (violenceKeywords.includes(keyword)) {
        categories.violence++;
      } else if (explicitKeywords.includes(keyword)) {
        categories.explicit++;
      } else if (offensiveKeywords.includes(keyword)) {
        categories.offensive++;
      } else {
        categories.other++;
      }
    }

    return {
      totalNegativeKeywords: this.negativeKeywords.size,
      categories,
    };
  }
}