import { describe, it, expect, vi } from 'vitest';
import { PixabayProvider } from '../PixabayProvider';
import { OrientationEnum } from '../../../../../types/shorts';
import { VideoProviderConfig } from '../../types';
import { VideoSearchError } from '../../../VideoProvider';

const mockConfig: VideoProviderConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 10000,
  userAgent: 'test-agent',
  rateLimit: {
    requestsPerSecond: 10,
    burstLimit: 50
  }
};

describe('BrokenSearchScenario - The actual error from logs', () => {
  it('should demonstrate the exact error scenario from the dev server logs', async () => {
    const provider = new PixabayProvider(mockConfig, 'test-api-key');
    
    // Mock the API to return no results for "broken" search
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        total: 0,
        totalHits: 0,
        hits: [] // Empty results - this is what causes the error
      })
    });

    // This is the exact call that's failing in the VideoProviderFacade
    const searchPromise = provider.searchVideos(
      ['broken'], // The search term that's causing issues
      30,
      OrientationEnum.landscape,
      3
    );

    const result = await searchPromise;

    // The search itself doesn't throw - it returns empty results
    expect(result.videos).toHaveLength(0);
    expect(result.totalResults).toBe(0);
    expect(result.provider).toBe('Pixabay');

    // But when these empty results are processed by VideoProviderBase.findVideos()
    // and then by VideoProviderFacade.searchAcrossProviders(), it triggers the error
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('q=broken'),
      expect.any(Object)
    );

    fetchSpy.mockRestore();
  });

  it('should show how the error propagates through the system', async () => {
    const provider = new PixabayProvider(mockConfig, 'test-api-key');
    
    // Mock network error
    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValueOnce(
      new Error('Network timeout')
    );

    // This should propagate the error up
    await expect(
      provider.searchVideos(['broken'], 30, OrientationEnum.landscape, 3)
    ).rejects.toThrow('Network timeout');

    fetchSpy.mockRestore();
  });

  it('should handle the case where VideoProviderBase throws VideoSearchError', () => {
    const searchTerms = ['broken'];
    const error = new VideoSearchError(`No videos found for search: ${searchTerms.join(' ')}`);
    
    // This is the exact error message from the logs
    expect(error.message).toBe('No videos found for search: broken');
    expect(error.name).toBe('VideoSearchError');
    
    // This error would be caught by the VideoProviderFacade and added to the errors array
    expect(error instanceof VideoSearchError).toBe(true);
  });

  it('should demonstrate proper error handling in video provider facade flow', async () => {
    // This simulates what happens in VideoProviderFacade.searchAcrossProviders
    const provider = new PixabayProvider(mockConfig, 'test-api-key');
    
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        total: 0,
        totalHits: 0,
        hits: []
      })
    });

    try {
      const result = await provider.searchVideos(['broken'], 30, OrientationEnum.landscape, 3);
      
      // The provider itself doesn't throw, it returns empty results
      expect(result.videos).toHaveLength(0);
      
      // But the facade would detect this and add it to errors
      const errors: string[] = [];
      if (result.videos.length === 0) {
        errors.push(`${result.provider}: No videos found for search: broken`);
      }
      
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Pixabay: No videos found for search: broken');
      
    } catch (error) {
      // This shouldn't happen with our current implementation
      throw error;
    }

    fetchSpy.mockRestore();
  });
});