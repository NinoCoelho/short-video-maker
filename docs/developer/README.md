# Developer Documentation - Video Import Feature

This directory contains comprehensive developer documentation for the video import feature in the Short Video Maker application.

## Documentation Index

### Core Documentation
- [**Architecture Overview**](architecture-overview.md) - System architecture, data flow, and component relationships
- [**Service Documentation**](service-documentation.md) - Detailed documentation of all service classes
- [**Database Schema**](database-schema.md) - Database structure and relationships
- [**Event System**](event-system.md) - Event-driven architecture and usage patterns

### Development Guides
- [**Local Development Setup**](development-setup.md) - Setting up your development environment
- [**Extension Guide**](extension-guide.md) - Adding new platforms, TTS providers, and features
- [**Testing Guide**](testing-guide.md) - Testing strategies, tools, and best practices
- [**Performance Optimization**](performance-optimization.md) - Performance tips and optimization techniques

### Reference
- [**Contributing Guidelines**](contributing-guidelines.md) - Code standards and contribution process
- [**Configuration Options**](configuration-options.md) - Environment variables and settings
- [**API Reference**](api-reference.md) - REST API endpoints and WebSocket events

## Quick Start

If you're new to the video import feature development:

1. Start with the [Architecture Overview](architecture-overview.md) to understand the system
2. Follow the [Development Setup](development-setup.md) to configure your environment
3. Review the [Service Documentation](service-documentation.md) to understand the codebase
4. Check the [Extension Guide](extension-guide.md) for adding new features

## Feature Overview

The video import feature enables users to:
- Import videos from multiple platforms (YouTube, TikTok, Instagram, Facebook)
- Extract audio and generate transcriptions
- Analyze content using AI (via Ollama)
- Detect highlights and create suggested clips
- Smart crop videos for different orientations
- Generate subtitles and translations
- Convert imported content to the platform's short video format

## Key Technologies

- **Backend**: Node.js, TypeScript, Express
- **Video Processing**: FFmpeg, yt-dlp, Remotion
- **AI/ML**: Ollama (local), Whisper (transcription)
- **Database**: PostgreSQL with migrations
- **Frontend**: React 18, Material-UI, TypeScript
- **Real-time**: WebSocket (Socket.io), EventBus pattern

## Architecture Principles

- **Event-Driven**: All operations emit events for loose coupling
- **Service-Oriented**: Modular services with clear responsibilities  
- **Type-Safe**: Comprehensive TypeScript types throughout
- **Configurable**: Environment-based configuration
- **Testable**: Services designed for unit and integration testing
- **Scalable**: Queue-based processing with retry logic

## Getting Help

For questions about:
- **Architecture**: See [Architecture Overview](architecture-overview.md)
- **Development**: Check [Development Setup](development-setup.md)
- **Contributing**: Review [Contributing Guidelines](contributing-guidelines.md)
- **Performance**: Consult [Performance Optimization](performance-optimization.md)

## Related Documentation

- [Main README](../../README.md) - Application overview and basic setup
- [CLAUDE.md](../../CLAUDE.md) - Development commands and architecture summary
- [IMPORT-FEATURE-STATUS.md](../../IMPORT-FEATURE-STATUS.md) - Implementation status tracking