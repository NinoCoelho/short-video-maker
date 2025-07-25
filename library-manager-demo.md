# Library Manager Demo

This document demonstrates the comprehensive Library Manager implementation for managing music collections and overlay images.

## Features Implemented

### 🎵 Music Asset Management
- **Upload**: Support for MP3, WAV, OGG, M4A audio files
- **Metadata**: Title, duration, mood, tags, file size tracking
- **Organization**: Group music by mood (happy, sad, energetic, etc.)
- **Preview**: Built-in audio player for previewing tracks
- **Collections**: Organize music into custom collections

### 🖼️ Overlay Image Management  
- **Upload**: Support for PNG, JPG, JPEG, GIF, WebP image files
- **Metadata**: Title, dimensions, tags, file size tracking
- **Preview**: Image thumbnail and full-size preview
- **Collections**: Organize overlays by theme or project

### 🔧 Technical Features
- **RESTful API**: Complete CRUD operations via `/api/library/*` endpoints
- **File Validation**: MIME type checking and security validation
- **Storage**: Organized file storage in `static/music/` and `static/overlays/`
- **Metadata Storage**: JSON-based metadata storage in `data/library/`
- **Search & Filter**: Full-text search and filtering by type, mood, tags
- **Statistics**: Comprehensive library statistics and insights

## API Endpoints

### Assets
- `GET /api/library/assets` - List assets with filtering
- `GET /api/library/assets/:id` - Get specific asset
- `PUT /api/library/assets/:id` - Update asset metadata
- `DELETE /api/library/assets/:id` - Delete asset
- `POST /api/library/assets/upload` - Upload new asset

### Collections
- `GET /api/library/collections` - List collections
- `POST /api/library/collections` - Create collection
- `POST /api/library/collections/:collectionId/assets/:assetId` - Add asset to collection
- `DELETE /api/library/collections/:collectionId/assets/:assetId` - Remove asset from collection

### Utilities
- `GET /api/library/stats` - Get library statistics
- `GET /api/library/files/:type/:filename` - Serve asset files
- `GET /api/library/preview/:id` - Get asset preview info

## Frontend Interface

### Main Features
- **Modern UI**: Material-UI based responsive interface
- **Grid View**: Card-based asset display with thumbnails
- **Search Bar**: Real-time search across all assets
- **Filter Controls**: Filter by type, mood, tags, collections
- **Upload Dialog**: Drag-and-drop file upload with metadata
- **Audio Playback**: Built-in audio player for music assets
- **Context Menus**: Edit, download, delete operations
- **Statistics Dashboard**: Overview of library metrics

### Navigation
- **URL**: `/library-manager` 
- **Menu**: Available in sidebar navigation
- **Quick Action**: Direct access chip in dashboard

## File Organization

```
static/
├── music/                    # Music files storage
│   ├── *.mp3                # MP3 audio files
│   ├── *.wav                # WAV audio files
│   └── *.ogg                # OGG audio files
└── overlays/                # Overlay images storage
    ├── *.png                # PNG overlay files
    ├── *.jpg                # JPEG overlay files
    └── *.gif                # GIF overlay files

data/
└── library/                 # Metadata storage
    ├── assets.json          # Asset metadata
    └── collections.json     # Collection metadata
```

## Usage Examples

### Upload a Music File
```javascript
const formData = new FormData();
formData.append('file', musicFile);
formData.append('title', 'Epic Background Music');
formData.append('mood', 'energetic');
formData.append('tags', 'action,trailer,epic');

fetch('/api/library/assets/upload', {
  method: 'POST',
  body: formData
});
```

### Search Assets
```javascript
// Search for energetic music
fetch('/api/library/assets?type=music&mood=energetic&search=epic')
  .then(response => response.json())
  .then(data => console.log(data.assets));
```

### Create Collection
```javascript
fetch('/api/library/collections', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Trailer Music',
    description: 'Epic music for video trailers',
    type: 'music'
  })
});
```

## Security Features

- **File Validation**: MIME type and extension validation
- **Path Security**: Protection against directory traversal attacks
- **Upload Limits**: File size limits (100MB max)
- **Rate Limiting**: API rate limiting for upload endpoints
- **Input Sanitization**: Clean user input and prevent injection

## Integration with Video System

The Library Manager integrates seamlessly with the existing video creation pipeline:
- **Music Selection**: Background music selected from library assets
- **Overlay Application**: Overlay images applied to video frames
- **Metadata Usage**: Asset tags and moods used for automatic selection
- **File Serving**: Assets served with proper CORS headers for Remotion

## Performance Features

- **Efficient Storage**: JSON-based metadata with file system storage
- **Caching**: Smart caching of asset metadata
- **Lazy Loading**: On-demand loading of asset previews
- **Optimized Queries**: Indexed search and filtering
- **Memory Management**: Efficient memory usage for large libraries

This implementation provides a professional-grade asset management system that scales with library size and provides an excellent user experience for managing media collections.