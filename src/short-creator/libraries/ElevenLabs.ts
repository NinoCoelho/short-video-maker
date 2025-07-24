import fs from "fs-extra";
import axios from "axios";
import logger from "../../logger";

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
}

export interface TTSResult {
  audioPath: string;
  duration: number;
  subtitles: Array<{ text: string; start: number; end: number }>;
}

export class ElevenLabs {
  private apiKey: string;
  private baseUrl: string = "https://api.elevenlabs.io/v1";
  private defaultVoiceId: string = "21m00Tcm4TlvDq8ikWAM"; // Default voice (Rachel)

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY || "";
    if (!this.apiKey) {
      logger.warn("ElevenLabs API key not found. Service will use mock data.");
    }
  }

  /**
   * Generate speech from text using ElevenLabs API
   */
  public async generateSpeech(
    text: string,
    outputPath: string,
    voice?: string,
    language?: string,
    referenceAudioPath?: string
  ): Promise<TTSResult> {
    try {
      // If no API key, use mock data
      if (!this.apiKey) {
        return this.generateMockSpeech(text, outputPath);
      }

      const voiceId = voice || this.defaultVoiceId;
      
      logger.info(`Generating speech with ElevenLabs for text: ${text.substring(0, 50)}...`);

      // Prepare request payload
      const payload = {
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      };

      // Make API request
      const response = await axios.post(
        `${this.baseUrl}/text-to-speech/${voiceId}`,
        payload,
        {
          headers: {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": this.apiKey
          },
          responseType: "arraybuffer",
          timeout: 30000 // 30 seconds timeout
        }
      );

      // Save audio file
      await fs.ensureDir(require("path").dirname(outputPath));
      await fs.writeFile(outputPath, Buffer.from(response.data));

      // Estimate duration (rough calculation based on character count)
      const estimatedDuration = this.estimateAudioDuration(text);

      // Generate subtitle timing
      const subtitles = this.generateSubtitles(text, estimatedDuration);

      logger.info(`ElevenLabs speech generated successfully: ${outputPath}`);

      return {
        audioPath: outputPath,
        duration: estimatedDuration,
        subtitles
      };

    } catch (error) {
      logger.error({ error, text: text.substring(0, 50) }, "Failed to generate speech with ElevenLabs");
      
      // Fallback to mock data on error
      return this.generateMockSpeech(text, outputPath);
    }
  }

  /**
   * Get available voices from ElevenLabs
   */
  public async getVoices(): Promise<ElevenLabsVoice[]> {
    try {
      if (!this.apiKey) {
        return this.getMockVoices();
      }

      const response = await axios.get(`${this.baseUrl}/voices`, {
        headers: {
          "xi-api-key": this.apiKey
        },
        timeout: 10000
      });

      return response.data.voices || [];
    } catch (error) {
      logger.error({ error }, "Failed to fetch ElevenLabs voices");
      return this.getMockVoices();
    }
  }

  /**
   * Generate mock speech data for development/fallback
   */
  private async generateMockSpeech(text: string, outputPath: string): Promise<TTSResult> {
    logger.info(`Generating mock speech for: ${text.substring(0, 50)}...`);
    
    // Create dummy audio file
    await fs.ensureDir(require("path").dirname(outputPath));
    await fs.writeFile(outputPath, Buffer.from("dummy audio content"));

    const duration = this.estimateAudioDuration(text);
    const subtitles = this.generateSubtitles(text, duration);

    return {
      audioPath: outputPath,
      duration,
      subtitles
    };
  }

  /**
   * Estimate audio duration based on text length
   * Average reading speed: ~150 words per minute
   */
  private estimateAudioDuration(text: string): number {
    const wordsPerMinute = 150;
    const wordCount = text.split(/\s+/).length;
    const durationInMinutes = wordCount / wordsPerMinute;
    return Math.max(1, Math.round(durationInMinutes * 60)); // At least 1 second
  }

  /**
   * Generate subtitle timing based on text and duration
   */
  private generateSubtitles(text: string, totalDuration: number): Array<{ text: string; start: number; end: number }> {
    // Split text into sentences or reasonable chunks
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length === 0) {
      return [{ text, start: 0, end: totalDuration * 1000 }];
    }

    const subtitles = [];
    const durationPerSentence = totalDuration / sentences.length;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (sentence) {
        subtitles.push({
          text: sentence,
          start: Math.round(i * durationPerSentence * 1000),
          end: Math.round((i + 1) * durationPerSentence * 1000)
        });
      }
    }

    return subtitles;
  }

  /**
   * Get mock voices for development
   */
  private getMockVoices(): ElevenLabsVoice[] {
    return [
      { voice_id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", category: "generated" },
      { voice_id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", category: "generated" },
      { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", category: "generated" },
      { voice_id: "ErXwobaYiN019PkySvjV", name: "Antoni", category: "generated" },
      { voice_id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", category: "generated" }
    ];
  }
} 