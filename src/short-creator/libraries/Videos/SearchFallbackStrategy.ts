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
   * Generate progressive keyword removal strategies
   * Removes keywords from the end, then tries combinations
   */
  generateProgressiveFallbacks(originalTerms: string[]): string[][] {
    const fallbacks: string[][] = [];
    const terms = [...originalTerms];
    
    logger.info({ originalTerms }, 'Generating progressive fallbacks');

    // Strategy 1: Remove keywords from the end, one by one
    for (let i = terms.length - 1; i > 0; i--) {
      const reducedTerms = terms.slice(0, i);
      if (reducedTerms.length > 0) {
        fallbacks.push(reducedTerms);
        logger.debug({ 
          strategy: 'progressive_removal',
          step: terms.length - i,
          reducedTerms 
        }, 'Added progressive removal fallback');
      }
    }

    // Strategy 2: Try most important keywords (first 2)
    if (terms.length > 2) {
      const importantTerms = terms.slice(0, 2);
      fallbacks.push(importantTerms);
      logger.debug({ 
        strategy: 'important_terms',
        importantTerms 
      }, 'Added important terms fallback');
    }

    // Strategy 3: Try single most important keyword
    if (terms.length > 1) {
      const singleTerm = [terms[0]];
      fallbacks.push(singleTerm);
      logger.debug({ 
        strategy: 'single_term',
        singleTerm 
      }, 'Added single term fallback');
    }

    // Strategy 4: Use semantic fallbacks for specific terms
    const semanticFallbacks = this.generateSemanticFallbacks(terms);
    fallbacks.push(...semanticFallbacks);

    // Strategy 5: Generic category-based fallbacks
    const categoryFallbacks = this.generateCategoryBasedFallbacks(terms);
    fallbacks.push(...categoryFallbacks);

    logger.info({ 
      originalTerms, 
      fallbackStrategies: fallbacks.length,
      fallbacks: fallbacks.slice(0, 3) // Log first 3 for debugging
    }, 'Generated progressive fallback strategies');

    return fallbacks;
  }

  /**
   * Generate semantic alternatives for terms
   */
  private generateSemanticFallbacks(terms: string[]): string[][] {
    const semanticFallbacks: string[][] = [];
    
    // Try to find semantic alternatives for each term
    const alternatives = terms.map(term => {
      const lowerTerm = term.toLowerCase();
      return this.fallbackMap.get(lowerTerm) || [term];
    });

    // Create combinations of alternatives (limit to 3 combinations)
    for (let i = 0; i < Math.min(3, alternatives.length); i++) {
      const combination: string[] = [];
      for (let j = 0; j < alternatives.length; j++) {
        const termAlternatives = alternatives[j];
        const altIndex = (i + j) % termAlternatives.length;
        combination.push(termAlternatives[altIndex]);
      }
      
      if (combination.length > 0 && !this.isDuplicateFallback(semanticFallbacks, combination)) {
        semanticFallbacks.push(combination);
      }
    }

    return semanticFallbacks;
  }

  /**
   * Generate category-based fallbacks
   */
  private generateCategoryBasedFallbacks(terms: string[]): string[][] {
    const categoryFallbacks: string[][] = [];
    
    const religiousTerms = ['church', 'cross', 'prayer', 'faith', 'christian', 'worship'];
    const natureTerms = ['nature', 'landscape', 'outdoor', 'scenery', 'forest', 'water'];
    const emotionalTerms = ['heart', 'love', 'broken', 'emotion', 'feeling'];
    const abstractTerms = ['abstract', 'artistic', 'creative', 'modern', 'design'];
    
    const hasReligious = terms.some(t => religiousTerms.includes(t.toLowerCase()));
    const hasNature = terms.some(t => natureTerms.includes(t.toLowerCase()));
    const hasEmotional = terms.some(t => emotionalTerms.includes(t.toLowerCase()));
    const hasAbstract = terms.some(t => abstractTerms.includes(t.toLowerCase()));
    
    if (hasReligious) {
      categoryFallbacks.push(['spiritual', 'peaceful']);
      categoryFallbacks.push(['meditation', 'calm']);
    }
    
    if (hasNature) {
      categoryFallbacks.push(['scenic', 'outdoor']);
      categoryFallbacks.push(['landscape', 'natural']);
    }
    
    if (hasEmotional) {
      categoryFallbacks.push(['emotional', 'mood']);
      categoryFallbacks.push(['abstract', 'artistic']);
    }
    
    if (hasAbstract) {
      categoryFallbacks.push(['creative', 'design']);
      categoryFallbacks.push(['modern', 'artistic']);
    }
    
    // Add generic fallbacks if no specific category detected
    if (!hasReligious && !hasNature && !hasEmotional && !hasAbstract) {
      categoryFallbacks.push(['beautiful', 'peaceful']);
      categoryFallbacks.push(['calm', 'serene']);
      categoryFallbacks.push(['nature', 'landscape']);
    }

    return categoryFallbacks;
  }

  /**
   * Check if a fallback combination already exists
   */
  private isDuplicateFallback(existingFallbacks: string[][], newFallback: string[]): boolean {
    return existingFallbacks.some(existing => 
      existing.length === newFallback.length &&
      existing.every((term, index) => term === newFallback[index])
    );
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