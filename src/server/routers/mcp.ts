import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import z from "zod";

import { ShortCreator } from "../../short-creator/ShortCreator";
import { logger } from "../../logger";
import { renderConfig, sceneInput } from "../../types/shorts";
import { NotFoundError, ProcessingError, ValidationError } from "../errors/AppError";

export class MCPRouter {
  router: express.Router;
  shortCreator: ShortCreator;
  transports: { [sessionId: string]: SSEServerTransport } = {};
  mcpServer: McpServer;
  
  constructor(shortCreator: ShortCreator) {
    this.router = express.Router();
    this.shortCreator = shortCreator;

    this.mcpServer = new McpServer({
      name: "Short Video Creator",
      version: "2.0.0",
      capabilities: {
        resources: {
          subscribe: true,
        },
        tools: {},
      },
    });

    this.setupMCPServer();
    this.setupRoutes();
  }

  private setupMCPServer() {
    // Tool para obter status de vídeo
    this.mcpServer.tool(
      "get-video-status",
      "Get the current status of a video by ID (ready, processing, failed, pending)",
      {
        videoId: z.string().describe("The unique ID of the video to check"),
      },
      async ({ videoId }) => {
        try {
          if (!videoId || typeof videoId !== 'string') {
            throw new ValidationError("Video ID is required and must be a string");
          }

          const statusObject = await this.shortCreator.status(videoId);
          
          if (!statusObject) {
            throw new NotFoundError("Video", videoId);
          }
          
          let statusText = `Status: ${statusObject.status}`;
          
          if (statusObject.progress) {
            statusText += `\nProgress: ${statusObject.progress}%`;
          }
          
          if (statusObject.stage) {
            statusText += `\nStage: ${statusObject.stage}`;
          }
          
          if (statusObject.error) {
            statusText += `\nError: ${statusObject.error}`;
          }

          if (statusObject.message) {
            statusText += `\nMessage: ${statusObject.message}`;
          }

          return {
            content: [
              {
                type: "text",
                text: statusText,
              },
            ],
          };
        } catch (error) {
          logger.error({ error, videoId }, "Error in MCP get-video-status tool");
          
          if (error instanceof ValidationError || error instanceof NotFoundError) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
          
          return {
            content: [
              {
                type: "text",
                text: `Error getting video status: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool para criar vídeos curtos
    this.mcpServer.tool(
      "create-short-video",
      "Create a short video from scenes with text and search terms",
      {
        scenes: z.array(sceneInput).describe("Array of scenes, each containing text and search terms for background videos"),
        config: renderConfig.describe("Configuration for video rendering (voice, orientation, music, etc.)"),
      },
      async ({ scenes, config }) => {
        try {
          const videoId = await this.shortCreator.addToQueue(scenes, config);
          
          return {
            content: [
              {
                type: "text",
                text: `Video created successfully! Video ID: ${videoId}\nStatus: Added to processing queue\nYou can check the status using get-video-status tool.`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error creating video: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
          };
        }
      },
    );

    // Tool para listar todos os vídeos
    this.mcpServer.tool(
      "list-videos",
      "List all videos with their current status",
      {},
      async () => {
        try {
          const videos = await this.shortCreator.getAllVideos();
          
          if (videos.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: "No videos found.",
                },
              ],
            };
          }

          let videoList = `Found ${videos.length} videos:\n\n`;
          
          videos.forEach((video: any, index: number) => {
            videoList += `${index + 1}. Video ID: ${video.id}\n`;
            videoList += `   Status: ${video.status}\n`;
            
            if (video.progress) {
              videoList += `   Progress: ${video.progress}%\n`;
            }
            
            if (video.createdAt) {
              videoList += `   Created: ${new Date(video.createdAt).toLocaleString()}\n`;
            }
            
            if (video.scenes && video.scenes.length > 0) {
              const firstSceneText = video.scenes[0].text;
              if (firstSceneText) {
                const preview = firstSceneText.length > 50 
                  ? firstSceneText.substring(0, 50) + "..." 
                  : firstSceneText;
                videoList += `   Preview: "${preview}"\n`;
              }
            }
            
            videoList += "\n";
          });

          return {
            content: [
              {
                type: "text",
                text: videoList,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error listing videos: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
          };
        }
      },
    );

    // Tool para deletar vídeo
    this.mcpServer.tool(
      "delete-video",
      "Delete a video by ID",
      {
        videoId: z.string().describe("The ID of the video to delete"),
      },
      async ({ videoId }) => {
        try {
          await this.shortCreator.deleteVideo(videoId);
          
          return {
            content: [
              {
                type: "text",
                text: `Video ${videoId} deleted successfully.`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error deleting video: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
          };
        }
      },
    );

    // Tool para buscar vídeos
    this.mcpServer.tool(
      "search-videos",
      "Search for background videos using keywords",
      {
        query: z.string().describe("Search query for finding background videos"),
        count: z.number().optional().describe("Number of videos to return (default: 5)"),
      },
      async ({ query, count = 5 }) => {
        try {
          const videos = await this.shortCreator.searchVideos(query);
          const limitedVideos = videos.slice(0, count);
          
          if (limitedVideos.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No videos found for query: "${query}"`,
                },
              ],
            };
          }

          let result = `Found ${limitedVideos.length} videos for "${query}":\n\n`;
          
          limitedVideos.forEach((video: any, index: number) => {
            result += `${index + 1}. Video ID: ${video.id}\n`;
            result += `   URL: ${video.url}\n`;
            result += `   Duration: ${video.duration}s\n`;
            result += `   Dimensions: ${video.width}x${video.height}\n\n`;
          });

          return {
            content: [
              {
                type: "text",
                text: result,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error searching videos: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
          };
        }
      },
    );

    // Tool para gerar TTS
    this.mcpServer.tool(
      "generate-tts",
      "Generate text-to-speech audio from text",
      {
        text: z.string().describe("Text to convert to speech"),
        voice: z.string().optional().describe("Voice to use (default: Paulo)"),
        language: z.enum(["pt", "en"]).optional().describe("Language (pt for Portuguese, en for English)"),
      },
      async ({ text, voice = "Paulo", language = "pt" }) => {
        try {
          const tempId = `tts_${Date.now()}`;
          const sceneId = `scene_${Date.now()}`;
          
          const config = {
            voice: voice as any,
            language: language as "pt" | "en"
          };

          const audioResult = await this.shortCreator.generateSingleTTSAndUpdate(
            tempId,
            sceneId,
            text,
            config,
            false
          );

          return {
            content: [
              {
                type: "text",
                text: `TTS audio generated successfully!\nDuration: ${audioResult.duration}s\nAudio URL: ${audioResult.audioUrl}\nText: "${text}"`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error generating TTS: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
          };
        }
      },
    );

    // Tool para obter informações do sistema
    this.mcpServer.tool(
      "get-system-info",
      "Get system information including available voices, music tags, and cache stats",
      {},
      async () => {
        try {
          const voices = this.shortCreator.ListAvailableVoices();
          const musicTags = this.shortCreator.ListAvailableMusicTags();
          const cacheStats = this.shortCreator.getCacheStats();
          
          let info = "=== Short Video Maker System Info ===\n\n";
          
          info += `Available Voices (${voices.length}):\n`;
          voices.forEach((voice, index) => {
            info += `  ${index + 1}. ${voice}\n`;
          });
          
          info += `\nAvailable Music Tags (${musicTags.length}):\n`;
          musicTags.forEach((tag, index) => {
            info += `  ${index + 1}. ${tag}\n`;
          });
          
          info += "\nCache Statistics:\n";
          info += `  Cached Videos: ${cacheStats.count}\n`;
          info += `  Total Size: ${cacheStats.totalSizeFormatted}\n`;

          return {
            content: [
              {
                type: "text",
                text: info,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error getting system info: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
          };
        }
      },
    );
  }

  private setupRoutes() {
    this.router.get("/sse", async (req, res) => {
      logger.info("MCP SSE connection requested");

      const transport = new SSEServerTransport("/mcp/messages", res);
      this.transports[transport.sessionId] = transport;
      
      res.on("close", () => {
        logger.info(`MCP SSE connection closed: ${transport.sessionId}`);
        delete this.transports[transport.sessionId];
      });
      
      await this.mcpServer.connect(transport);
    });

    this.router.post("/messages", async (req, res) => {
      logger.info("MCP message received");

      const sessionId = req.query.sessionId as string;
      const transport = this.transports[sessionId];
      
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        logger.error(`No transport found for sessionId: ${sessionId}`);
        res.status(400).send("No transport found for sessionId");
      }
    });

    // Health check endpoint
    this.router.get("/health", (req, res) => {
      res.status(200).json({
        status: "healthy",
        server: "Short Video Creator MCP",
        version: "2.0.0",
        activeConnections: Object.keys(this.transports).length,
        capabilities: {
          tools: [
            "get-video-status",
            "create-short-video", 
            "list-videos",
            "delete-video",
            "search-videos",
            "generate-tts",
            "get-system-info"
          ],
          resources: ["video-data", "system-info"]
        }
      });
    });
  }
}
