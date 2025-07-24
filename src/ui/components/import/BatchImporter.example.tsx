import React from 'react';
import { Container, Typography, Box } from '@mui/material';
import BatchImporter from './BatchImporter';
import { OrientationEnum, MusicMoodEnum } from '../../../types/shorts';

/**
 * Example usage of the BatchImporter component
 * 
 * This component demonstrates how to integrate the BatchImporter
 * into your application with various configuration options.
 */
const BatchImporterExample: React.FC = () => {
  // Default settings to apply to all videos in the batch
  const defaultSettings = {
    targetLanguage: 'en',
    music: MusicMoodEnum.happy,
    orientation: OrientationEnum.portrait,
    autoHighlights: true,
    maxSegmentDuration: 90,
    minSegmentDuration: 10
  };

  // Handler for when individual videos complete processing
  const handleVideoComplete = (video: any) => {
    console.log('Video completed:', video);
    // You can add custom logic here, such as:
    // - Showing notifications
    // - Updating UI state
    // - Sending data to analytics
  };

  // Handler for when the entire batch completes processing
  const handleBatchComplete = (batch: any[]) => {
    console.log('Batch completed:', batch);
    // You can add custom logic here, such as:
    // - Redirecting to results page
    // - Showing summary statistics
    // - Sending completion notifications
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box mb={4}>
        <Typography variant="h3" component="h1" gutterBottom>
          Batch Video Import Demo
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          This page demonstrates the BatchImporter component with all its features:
        </Typography>
        <Box component="ul" sx={{ pl: 2 }}>
          <li>Import multiple videos via URLs, CSV files, or text files</li>
          <li>Apply global settings to all videos or configure individually</li>
          <li>Real-time progress tracking with WebSocket integration</li>
          <li>Error handling with retry mechanisms</li>
          <li>Save and load batch configurations</li>
          <li>Comprehensive batch statistics and monitoring</li>
        </Box>
      </Box>

      <BatchImporter
        onVideoComplete={handleVideoComplete}
        onBatchComplete={handleBatchComplete}
        defaultSettings={defaultSettings}
        maxBatchSize={25} // Limit batch size for demo
        websocketUrl="ws://localhost:3233/ws" // Custom WebSocket URL
      />
    </Container>
  );
};

export default BatchImporterExample;

/**
 * Integration Notes:
 * 
 * 1. WebSocket Integration:
 *    - Ensure your WebSocket server handles these message types:
 *      - 'batch-start': Start processing a batch of videos
 *      - 'retry-video': Retry a failed video
 *      - 'batch-video-progress': Progress updates for individual videos
 *      - 'batch-complete': Entire batch processing complete
 * 
 * 2. CSV Format:
 *    - The component expects CSV files with at least a URL column
 *    - Optional columns: title, description, platform
 *    - Example CSV:
 *      url,title
 *      https://youtube.com/watch?v=abc123,Video 1
 *      https://youtube.com/watch?v=def456,Video 2
 * 
 * 3. Backend Integration:
 *    - The component expects these API endpoints:
 *      - POST /api/import/batch - Start batch import
 *      - POST /api/import/retry - Retry failed video
 *      - GET /api/import/status/:id - Get import status
 * 
 * 4. File Upload:
 *    - Text files: One URL per line
 *    - CSV files: Structured data with headers
 *    - Maximum file size: 10MB (configurable)
 * 
 * 5. Configuration Persistence:
 *    - Batch configurations are stored in localStorage
 *    - Can be extended to use backend storage
 *    - Includes settings, video count, and creation date
 * 
 * 6. Error Handling:
 *    - Individual video errors don't stop the batch
 *    - Retry mechanism for failed videos
 *    - Comprehensive error reporting
 *    - WebSocket connection fallback to polling
 */