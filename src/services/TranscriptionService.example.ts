/**
 * TranscriptionService Usage Examples
 * 
 * This file demonstrates how to use the enhanced TranscriptionService
 * for audio transcription with various features like caching, storage,
 * and multiple provider support.
 */

import { TranscriptionService } from './TranscriptionService';
import path from 'path';

async function main() {
  // Initialize the service
  const dataDir = path.join(process.cwd(), 'data');
  const service = new TranscriptionService(dataDir);

  // Wait a moment for initialization to complete
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('=== TranscriptionService Examples ===\n');

  // 1. Get service information
  console.log('1. Service Information:');
  const stats = await service.getServiceStats();
  console.log('- Total transcriptions:', stats.totalTranscriptions);
  console.log('- Supported providers:', stats.supportedProviders.join(', '));
  console.log('- Available models:', stats.availableModels.join(', '));
  console.log('- Cache size:', stats.cacheSize);
  console.log('- Storage size:', stats.storageSize, 'bytes\n');

  // 2. Show supported languages
  console.log('2. Supported Languages:');
  const languages = service.getSupportedLanguages();
  console.log('Available languages:', languages.slice(0, 5).map(l => `${l.name} (${l.code})`).join(', '), '...\n');

  // 3. Show available models
  console.log('3. Available Models:');
  const models = service.getAvailableModels();
  models.forEach(model => {
    console.log(`- ${model.name}: ${model.size} - ${model.description}`);
  });
  console.log();

  // 4. Example transcription (would require an actual audio file)
  console.log('4. Transcription Example (requires audio file):');
  console.log(`
// Basic transcription
const result = await service.transcribe('/path/to/audio.wav');

// Advanced transcription with options
const advancedResult = await service.transcribe('/path/to/audio.wav', {
  model: 'base',
  language: 'en',
  wordTimestamps: true,
  provider: 'whisper-node', // or 'whisper-cpp', 'system'
  useGpu: true,
  preprocessingOptions: {
    reduceNoise: true,
    normalizeAudio: true,
    removeSilence: false
  }
});

// Video transcription
const videoResult = await service.transcribeVideo('/path/to/video.mp4', {
  audioTrackIndex: 0,
  model: 'small',
  language: 'auto'
});
  `);

  // 5. Cache management
  console.log('5. Cache Management:');
  const cacheStats = await service.getCacheStats();
  console.log('- Current cache size:', cacheStats.size);
  
  await service.clearCache();
  console.log('- Cache cleared');
  
  const newCacheStats = await service.getCacheStats();
  console.log('- New cache size:', newCacheStats.size, '\n');

  // 6. Storage management
  console.log('6. Storage Management:');
  const cleanupResult = await service.cleanupStorage({
    olderThanDays: 30,
    clearCache: true
  });
  console.log('- Files deleted:', cleanupResult.deletedFiles);
  console.log('- Space freed:', cleanupResult.freedSpace, 'bytes\n');

  // 7. Batch processing example
  console.log('7. Batch Processing Example:');
  console.log(`
// Process multiple audio files
const audioFiles = [
  '/path/to/audio1.wav',
  '/path/to/audio2.wav',
  '/path/to/audio3.wav'
];

const batchResults = await service.transcribeBatch(audioFiles, {
  model: 'base',
  language: 'en'
});

// Process results
for (const [filePath, result] of batchResults) {
  if (result instanceof Error) {
    console.error(\`Failed to transcribe \${filePath}:\`, result.message);
  } else {
    console.log(\`\${filePath}: \${result.text.substring(0, 100)}...\`);
  }
}
  `);

  // 8. Export examples
  console.log('8. Export Examples:');
  console.log(`
// Export transcription in different formats
const transcriptionResult = { /* ... result from transcribe() ... */ };

await service.exportTranscription(transcriptionResult, 'srt', './subtitles.srt');
await service.exportTranscription(transcriptionResult, 'vtt', './subtitles.vtt');
await service.exportTranscription(transcriptionResult, 'json', './transcription.json');
await service.exportTranscription(transcriptionResult, 'txt', './transcript.txt');
  `);

  // 9. Event listening
  console.log('9. Event Listening Example:');
  console.log(`
// Listen to transcription events
service.on('job:created', (job) => {
  console.log('Transcription job created:', job.id);
});

service.on('job:progress', ({ jobId, progress }) => {
  console.log(\`Job \${jobId}: \${progress}% complete\`);
});

service.on('job:completed', (job) => {
  console.log('Transcription completed:', job.id);
  console.log('Text:', job.result?.text.substring(0, 100) + '...');
});

service.on('job:failed', (job) => {
  console.error('Transcription failed:', job.error);
});

service.on('transcription:cache-hit', ({ audioPath }) => {
  console.log('Cache hit for:', audioPath);
});
  `);

  // 10. Error handling
  console.log('10. Error Handling Example:');
  console.log(`
try {
  const result = await service.transcribe('/path/to/audio.wav', {
    model: 'base',
    provider: 'system'
  });
  
  console.log('Transcription successful:', result.text);
} catch (error) {
  if (error.message.includes('Whisper is not installed')) {
    console.error('Please install Whisper: pip install openai-whisper');
  } else if (error.message.includes('file not found')) {
    console.error('Audio file not found');
  } else {
    console.error('Transcription failed:', error.message);
  }
}
  `);

  console.log('\n=== Examples Complete ===');
  console.log('\nTo use these examples with real audio files:');
  console.log('1. Install Whisper: pip install openai-whisper');
  console.log('2. Prepare audio files in WAV format');
  console.log('3. Update the file paths in the examples above');
  console.log('4. Run the transcription methods');
}

// Run examples if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main as runTranscriptionExamples };