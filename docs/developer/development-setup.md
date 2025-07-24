# Local Development Setup - Video Import Feature

This guide covers setting up your local development environment for working with the video import feature.

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Installation](#installation)
3. [Environment Configuration](#environment-configuration)
4. [External Services Setup](#external-services-setup)
5. [Development Commands](#development-commands)
6. [Docker Development](#docker-development)
7. [Troubleshooting](#troubleshooting)

## System Requirements

### Operating System
- **macOS**: 10.15+ (Catalina or later)
- **Windows**: Windows 10/11 (with WSL2 recommended)
- **Linux**: Ubuntu 20.04+ / CentOS 8+ / Similar distributions

### Required Software

```bash
# Node.js (version 18 or later)
node --version  # Should output v18.0.0 or later
npm --version   # Should output 9.0.0 or later

# Git
git --version

# FFmpeg (for video processing)
ffmpeg -version

# Python 3.9+ (for optional TTS service)
python3 --version
```

### Hardware Recommendations

**Minimum:**
- CPU: 4 cores
- RAM: 8GB
- Storage: 20GB free space
- Network: Stable internet connection

**Recommended:**
- CPU: 8+ cores
- RAM: 16GB+
- Storage: 50GB+ free space (for video processing)
- GPU: Optional, for accelerated AI processing

## Installation

### 1. Clone Repository

```bash
# Clone the repository
git clone https://github.com/your-org/short-video-maker.git
cd short-video-maker

# Checkout the appropriate branch
git checkout realtime-systems  # or your working branch
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Or using pnpm (if preferred)
pnpm install

# Install Python dependencies (for TTS service)
pip install -r requirements.txt
```

### 3. Install System Dependencies

#### macOS (using Homebrew)

```bash
# Install FFmpeg
brew install ffmpeg

# Install Ollama (for AI features)
brew install ollama

# Start Ollama service
ollama serve &

# Pull required models
ollama pull llama3.1:8b
```

#### Ubuntu/Debian

```bash
# Update package list
sudo apt update

# Install FFmpeg
sudo apt install ffmpeg

# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama
sudo systemctl start ollama
sudo systemctl enable ollama

# Pull models
ollama pull llama3.1:8b
```

#### Windows (using Chocolatey or manual installation)

```powershell
# Install FFmpeg via Chocolatey
choco install ffmpeg

# Or download from https://ffmpeg.org/download.html
# Add to PATH manually

# Install Ollama
# Download from https://ollama.ai/download/windows
# Follow installer instructions

# Pull models
ollama pull llama3.1:8b
```

## Environment Configuration

### 1. Create Environment File

```bash
# Copy example environment file
cp .env.example .env

# Edit with your preferred editor
nano .env  # or code .env, vim .env, etc.
```

### 2. Configure Environment Variables

```bash
# .env file configuration
# Copy this template and fill in your values

# Basic Configuration
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Database (if using PostgreSQL in future)
# DATABASE_URL=postgresql://username:password@localhost:5432/short_video_maker

# Storage Paths
DATA_DIR=./data
TEMP_DIR=./data/temp
IMPORT_DATA_DIR=./data/imports
VIDEO_CACHE_DIR=./data/video-cache
LOG_DIR=./logs

# Processing Limits
MAX_CONCURRENT_DOWNLOADS=3
MAX_FILE_SIZE=1073741824  # 1GB in bytes
MAX_DURATION=3600         # 1 hour in seconds
QUEUE_CLEANUP_INTERVAL_HOURS=6

# AI Services
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
OLLAMA_TIMEOUT=30000

# OpenAI (optional)
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4

# Google AI (optional)
GOOGLE_AI_API_KEY=your_google_ai_key_here

# TTS Providers
ELEVENLABS_API_KEY=your_elevenlabs_api_key
OPENAI_TTS_VOICE=alloy

# Translation Services
DEEPL_API_KEY=your_deepl_api_key
GOOGLE_TRANSLATE_API_KEY=your_google_translate_key

# Transcription
WHISPER_MODEL=base
WHISPER_LANGUAGE=auto

# Video Processing
REMOTION_HOST=localhost
REMOTION_PORT=3122

# External APIs (optional)
YOUTUBE_API_KEY=your_youtube_api_key
PEXELS_API_KEY=your_pexels_api_key
PIXABAY_API_KEY=your_pixabay_api_key

# Security
JWT_SECRET=your_jwt_secret_here
CORS_ORIGIN=http://localhost:3232

# Development Features
ENABLE_DEBUG_LOGS=true
ENABLE_PERFORMANCE_MONITORING=true
MOCK_EXTERNAL_SERVICES=false  # Set to true to mock APIs during development
```

### 3. Create Required Directories

```bash
# Create data directories
mkdir -p data/{imports,temp,video-cache,status,translations}
mkdir -p logs
mkdir -p downloads

# Set appropriate permissions (Unix/Linux/macOS)
chmod 755 data
chmod 755 logs
```

## External Services Setup

### 1. Ollama Setup (Local AI)

```bash
# Start Ollama service
ollama serve &

# Pull required models
ollama pull llama3.1:8b          # Main model
ollama pull llama3.1:8b-instruct # Instruction-tuned variant
ollama pull codellama:7b         # Code analysis (optional)

# Test Ollama
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.1:8b",
  "prompt": "Hello, world!",
  "stream": false
}'
```

### 2. OpenAI Setup (Optional)

```bash
# Test OpenAI API
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### 3. TTS Service Setup

#### Python TTS Service

```bash
# Navigate to TTS service directory
cd scripts/tts

# Install Python dependencies
pip install -r requirements.txt

# Test TTS service
python tts_service.py
```

#### External TTS Providers

```bash
# Test ElevenLabs (if configured)
curl -X POST \
  https://api.elevenlabs.io/v1/voices \
  -H "xi-api-key: $ELEVENLABS_API_KEY"

# Test OpenAI TTS (if configured)
curl https://api.openai.com/v1/audio/speech \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "tts-1", "input": "Hello world", "voice": "alloy"}' \
  --output speech.mp3
```

## Development Commands

### Basic Development

```bash
# Start development server (both backend and frontend)
npm run dev

# Start only backend server
npm run dev:server

# Start only frontend
npm run dev:ui

# Start Remotion video server
npm run remotion:server
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test VideoImportService.test.ts

# Run integration tests
npm run test:integration

# Run performance tests
npm run test:performance

# Generate coverage report
npm run test:coverage
```

### Code Quality

```bash
# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format

# Build project
npm run build

# Build for production
npm run build:prod
```

### Database Operations (if using PostgreSQL)

```bash
# Run database migrations
npm run db:migrate

# Rollback migration
npm run db:rollback

# Seed database
npm run db:seed

# Reset database
npm run db:reset
```

## Docker Development

### Using Docker Compose

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: main.Dockerfile
      target: development
    ports:
      - "3000:3000"
      - "3232:3232"
    volumes:
      - .:/app
      - /app/node_modules
      - ./data:/app/data
    environment:
      - NODE_ENV=development
      - OLLAMA_BASE_URL=http://ollama:11434
    depends_on:
      - ollama
      - redis
    command: npm run dev

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    environment:
      - OLLAMA_MODELS=/root/.ollama/models

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: short_video_maker
      POSTGRES_USER: developer
      POSTGRES_PASSWORD: development
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  ollama_data:
  redis_data:
  postgres_data:
```

### Docker Commands

```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop environment
docker-compose -f docker-compose.dev.yml down

# Rebuild and restart
docker-compose -f docker-compose.dev.yml up --build

# Execute commands in container
docker-compose -f docker-compose.dev.yml exec app npm test
```

## Development Workflow

### Daily Development

```bash
# 1. Start your day
git pull origin main
npm install  # In case dependencies changed

# 2. Start development environment
npm run dev

# 3. Make your changes
# Edit files in your preferred editor

# 4. Test your changes
npm test
npm run lint

# 5. Commit and push
git add .
git commit -m "feat: implement new feature"
git push origin feature/your-feature-branch
```

### Working with the Import Feature

```bash
# Test video import functionality
curl -X POST http://localhost:3000/api/import \
  -H "Content-Type: application/json" \
  -d '{
    "source": "youtube",
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "config": {
      "transcribe": true,
      "analyze": true,
      "generateSuggestions": true
    }
  }'

# Monitor logs
tail -f logs/server-$(date +%Y%m%d).log

# Check import status
curl http://localhost:3000/api/import/{job-id}/status
```

### Frontend Development

```bash
# Start frontend with hot reload
npm run dev:ui

# Build frontend for production
npm run build:ui

# Access frontend
open http://localhost:3232
```

## IDE Setup

### VS Code Configuration

Create `.vscode/settings.json`:

```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/coverage": true,
    "**/.next": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/coverage": true,
    "**/logs": true,
    "**/data": true
  }
}
```

### Recommended VS Code Extensions

```bash
# Install via VS Code Extensions marketplace
code --install-extension esbenp.prettier-vscode
code --install-extension ms-vscode.vscode-typescript-next
code --install-extension bradlc.vscode-tailwindcss
code --install-extension ms-vscode.vscode-json
code --install-extension redhat.vscode-yaml
code --install-extension ms-python.python
code --install-extension ms-vscode.vscode-docker
```

## Troubleshooting

### Common Issues

#### 1. Port Already in Use

```bash
# Find process using port 3000
lsof -ti:3000

# Kill process
kill -9 $(lsof -ti:3000)

# Or use different port
PORT=3001 npm run dev
```

#### 2. FFmpeg Not Found

```bash
# Verify FFmpeg installation
which ffmpeg
ffmpeg -version

# Install if missing (macOS)
brew install ffmpeg

# Install if missing (Ubuntu)
sudo apt install ffmpeg
```

#### 3. Ollama Connection Issues

```bash
# Check Ollama status
ollama list

# Restart Ollama
pkill ollama
ollama serve &

# Test connection
curl http://localhost:11434/api/tags
```

#### 4. Memory Issues During Video Processing

```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
npm run dev

# Or modify package.json scripts
"dev": "NODE_OPTIONS='--max-old-space-size=4096' concurrently ..."
```

#### 5. File Permission Issues

```bash
# Fix data directory permissions
sudo chown -R $USER:$GROUP data/
chmod -R 755 data/

# Fix log directory permissions
sudo chown -R $USER:$GROUP logs/
chmod -R 755 logs/
```

#### 6. Database Connection Issues

```bash
# Check PostgreSQL status (if using)
pg_isready -h localhost -p 5432

# Reset database
npm run db:reset

# Check database logs
tail -f /usr/local/var/log/postgres.log  # macOS
sudo journalctl -u postgresql -f        # Linux
```

### Performance Optimization

#### 1. Enable Node.js Inspector

```bash
# Start with debugging enabled
node --inspect=0.0.0.0:9229 dist/index.js

# Or with development server
NODE_OPTIONS="--inspect=0.0.0.0:9229" npm run dev
```

#### 2. Monitor Resource Usage

```bash
# Monitor CPU and memory
htop

# Monitor disk space
df -h

# Monitor network
netstat -an | grep :3000
```

#### 3. Optimize Video Processing

```bash
# Use hardware acceleration (if available)
export FFMPEG_ARGS="-hwaccel videotoolbox"  # macOS
export FFMPEG_ARGS="-hwaccel cuda"          # NVIDIA GPU

# Adjust processing limits
export MAX_CONCURRENT_DOWNLOADS=2
export MAX_FILE_SIZE=536870912  # 512MB
```

### Logging and Debugging

#### Enable Debug Logs

```bash
# Enable all debug logs
export DEBUG=*
npm run dev

# Enable specific module logs
export DEBUG=video-import:*
npm run dev

# View structured logs
tail -f logs/server-$(date +%Y%m%d-%H%M%S).log | jq
```

#### Application Health Checks

```bash
# Check API health
curl http://localhost:3000/health

# Check MCP server health
curl http://localhost:3000/mcp/health

# Check WebSocket connection
wscat -c ws://localhost:3000/ws
```

This development setup guide provides everything needed to get started with local development of the video import feature. Follow the steps in order, and refer to the troubleshooting section for common issues.