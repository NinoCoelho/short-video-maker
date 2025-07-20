import { logger } from '../../../logger';

export class SearchFallbackStrategy {
  private fallbackMap: Map<string, string[]> = new Map([
    // Religious terms
    ['church', ['worship', 'cathedral', 'chapel', 'sanctuary', 'temple']],
    ['cross', ['crucifix', 'christian symbol', 'faith', 'religious']],
    ['prayer', ['praying', 'meditation', 'worship', 'spiritual', 'devotion']],
    ['faith', ['belief', 'spiritual', 'trust', 'hope', 'devotion']],
    ['christian', ['religious', 'spiritual', 'worship', 'faith']],
    ['worship', ['praise', 'adoration', 'reverence', 'spiritual']],
    
    // Emotional/abstract terms
    ['broken', ['damaged', 'shattered', 'cracked', 'hurt']],
    ['heart', ['love', 'emotion', 'feeling', 'passion']],
    
    // Nature terms
    ['nature', ['outdoor', 'landscape', 'natural', 'environment']],
    ['landscape', ['scenery', 'view', 'nature', 'outdoor']],
    
    // Generic fallbacks
    ['abstract', ['artistic', 'creative', 'modern', 'design']],
    ['background', ['texture', 'pattern', 'abstract', 'design']],
  ]);

  /**
   * Generate alternative search terms when original search fails
   */
  generateFallbackTerms(originalTerms: string[]): string[] {
    const fallbackTerms: Set<string> = new Set();
    
    // First, try direct fallbacks for each term
    for (const term of originalTerms) {
      const lowerTerm = term.toLowerCase();
      const fallbacks = this.fallbackMap.get(lowerTerm);
      
      if (fallbacks) {
        fallbacks.forEach(fb => fallbackTerms.add(fb));
      } else {
        // Keep the original term if no fallback exists
        fallbackTerms.add(term);
      }
    }
    
    // If we still don't have enough terms, add generic ones
    if (fallbackTerms.size < 2) {
      ['peaceful', 'calm', 'serene', 'beautiful'].forEach(term => fallbackTerms.add(term));
    }
    
    const result = Array.from(fallbackTerms).slice(0, 5); // Limit to 5 terms
    logger.info({ originalTerms, fallbackTerms: result }, 'Generated fallback search terms');
    
    return result;
  }

  /**
   * Create a simplified search query from complex terms
   */
  simplifySearchQuery(terms: string[]): string {
    // Remove potentially problematic terms and keep the most generic ones
    const simplified = terms
      .filter(term => {
        const lower = term.toLowerCase();
        // Keep only non-specific terms
        return !['broken', 'cross', 'church'].includes(lower);
      })
      .slice(0, 2); // Keep only first 2 terms
    
    // If no terms left, use a generic search
    if (simplified.length === 0) {
      return 'peaceful nature';
    }
    
    return simplified.join(' ');
  }

  /**
   * Get category-based fallback terms
   */
  getCategoryFallback(terms: string[]): string[] {
    const religiousTerms = ['church', 'cross', 'prayer', 'faith', 'christian', 'worship'];
    const natureTerms = ['nature', 'landscape', 'outdoor', 'scenery'];
    const emotionalTerms = ['heart', 'love', 'broken', 'emotion'];
    
    // Check which category the search belongs to
    const isReligious = terms.some(t => religiousTerms.includes(t.toLowerCase()));
    const isNature = terms.some(t => natureTerms.includes(t.toLowerCase()));
    const isEmotional = terms.some(t => emotionalTerms.includes(t.toLowerCase()));
    
    if (isReligious) {
      return ['spiritual', 'peaceful', 'meditation', 'serene'];
    } else if (isNature) {
      return ['scenic', 'outdoor', 'beautiful', 'calm'];
    } else if (isEmotional) {
      return ['abstract', 'artistic', 'mood', 'atmosphere'];
    } else {
      return ['beautiful', 'peaceful', 'calm', 'serene'];
    }
  }
}