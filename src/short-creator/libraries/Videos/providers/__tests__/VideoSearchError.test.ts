import { describe, it, expect } from 'vitest';
import { VideoSearchError } from '../../../VideoProvider';

describe('VideoSearchError', () => {
  it('should create error with correct message', () => {
    const error = new VideoSearchError('No videos found for search: broken');
    
    expect(error.message).toBe('No videos found for search: broken');
    expect(error.name).toBe('VideoSearchError');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof VideoSearchError).toBe(true);
  });

  it('should create error for empty search results', () => {
    const searchTerms = ['nonexistent', 'query'];
    const error = new VideoSearchError(`No videos found for search: ${searchTerms.join(' ')}`);
    
    expect(error.message).toBe('No videos found for search: nonexistent query');
  });

  it('should have correct stack trace', () => {
    const error = new VideoSearchError('Test error');
    
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('VideoSearchError');
  });
});