import { Config } from "../../config";
import { logger } from "../../utils/logger";
import path from "path";
import fs from "fs/promises";
import axios, { AxiosError } from "axios";
import fetch from "node-fetch";

export class LocalTTS {
  private readonly serviceUrl: string;
  private outputDir: string;

  constructor(private config: Config, outputDir: string = "output/audio") {
    this.serviceUrl = "http://localhost:5003";
    this.outputDir = outputDir;
  }

  static async init(config: Config): Promise<LocalTTS> {
    return new LocalTTS(config);
  }

  async generateSpeech(
    text: string,
    outputPath: string,
    emotion: string = "neutral",
    language: string = "pt",
    referenceAudioPath?: string
  ): Promise<void> {
    logger.info("🚀 Iniciando geração de áudio com TTS", {
      text,
      outputPath,
      emotion,
      language,
      referenceAudioPath,
    });

    try {
      const refPath = referenceAudioPath || this.config.referenceAudioPath;
      const refFileName = path.basename(refPath);
      const refFileNameWithoutExt = path.parse(refFileName).name;
      
      logger.info("📂 Usando arquivo de referência", {
        refPath,
        absolutePath: path.resolve(refPath),
        refFileName,
        refFileNameWithoutExt
      });

      // Cria o diretório de saída se não existir
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Prepara a requisição
      const requestData = {
        text,
        language,
        reference_audio_filename: refFileNameWithoutExt
      };

      // Log the request details
      logger.debug("Sending request to TTS server", {
        url: `${this.serviceUrl}/api/tts`,
        requestData,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        }
      });

      // Faz a requisição para o serviço TTS usando fetch
      const response = await fetch(`${this.serviceUrl}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TTS server returned status ${response.status}: ${errorText}`);
      }

      const responseData = await response.json();

      // Log the response
      logger.debug("Received response from TTS server", {
        status: response.status,
        statusText: response.statusText,
        data: responseData,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!responseData || !responseData.download_link) {
        throw new Error("Invalid response from TTS server: missing download link");
      }

      // Faz o download do arquivo de áudio usando a URL completa
      const downloadUrl = `${this.serviceUrl}${responseData.download_link}`;
      logger.info("📥 Downloading audio file from URL", { 
        downloadUrl,
        originalLink: responseData.download_link,
        serviceUrl: this.serviceUrl
      });

      const downloadResponse = await axios.get(downloadUrl, {
        responseType: "arraybuffer",
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      // Salva o arquivo de áudio
      await fs.writeFile(outputPath, downloadResponse.data);
      
      logger.info("🎵 Speech generated successfully", { outputPath });
    } catch (error: unknown) {
      const axiosError = error as AxiosError;
      logger.error("❌ Failed to generate speech", {
        error,
        text,
        outputPath,
        emotion,
        language,
        referenceAudioPath,
        errorMessage: axiosError.message,
        errorResponse: axiosError.response?.data,
        errorStatus: axiosError.response?.status,
        errorHeaders: axiosError.response?.headers,
        errorConfig: {
          url: axiosError.config?.url,
          method: axiosError.config?.method,
          headers: axiosError.config?.headers,
          data: axiosError.config?.data
        }
      });
      throw error;
    }
  }
} 