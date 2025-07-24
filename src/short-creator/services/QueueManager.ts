import { logger } from "../../logger";
import { QueueItem, ImportQueueItem } from "../types/QueueItem";
import { SceneInput, RenderConfig } from "../../types/shorts";
import cuid from "cuid";

export interface QueueManagerCallbacks {
  onProcessCreationItem: (item: QueueItem) => Promise<void>;
  onProcessRenderItem: (videoId: string) => Promise<void>;
  onProcessImportItem: (item: ImportQueueItem) => Promise<void>;
}

export class QueueManager {
  // Creation queue
  private creationQueue: QueueItem[] = [];
  private isProcessingCreation = false;

  // Render queue
  private renderQueue: string[] = [];
  private isProcessingRender = false;

  // Import queue
  private importQueue: ImportQueueItem[] = [];
  private isProcessingImport = false;

  private callbacks: QueueManagerCallbacks;

  constructor(callbacks: QueueManagerCallbacks) {
    this.callbacks = callbacks;
  }

  // Creation Queue Methods
  public addToCreationQueue(
    sceneInput: SceneInput[],
    config: RenderConfig
  ): string {
    const videoId = cuid();
    logger.info({ videoId, sceneCount: sceneInput.length }, "Adding video to creation queue");

    this.creationQueue.push({
      id: videoId,
      sceneInput: sceneInput,
      config,
      status: "pending"
    });

    this.processCreationQueue();
    return videoId;
  }

  public async processCreationQueue(): Promise<void> {
    if (this.isProcessingCreation || this.creationQueue.length === 0) return;
    this.isProcessingCreation = true;

    const item = this.creationQueue.shift();
    if (!item) {
      this.isProcessingCreation = false;
      return;
    }
    
    try {
      await this.callbacks.onProcessCreationItem(item);
    } catch (error) {
      logger.error({ videoId: item.id, error }, "Error in creation pipeline");
    } finally {
      this.isProcessingCreation = false;
      this.processCreationQueue();
    }
  }

  // Render Queue Methods
  public addToRenderQueue(videoId: string): void {
    logger.info({ videoId }, "Adding video to render queue");
    this.renderQueue.push(videoId);
    this.processRenderQueue();
  }

  public async processRenderQueue(): Promise<void> {
    if (this.isProcessingRender || this.renderQueue.length === 0) return;
    this.isProcessingRender = true;

    const videoId = this.renderQueue.shift();
    if (!videoId) {
      this.isProcessingRender = false;
      return;
    }

    try {
      await this.callbacks.onProcessRenderItem(videoId);
    } catch (error) {
      logger.error({ videoId, error }, "Error in render queue");
    } finally {
      this.isProcessingRender = false;
      this.processRenderQueue();
    }
  }

  // Import Queue Methods
  public addToImportQueue(item: ImportQueueItem): void {
    logger.info({ 
      videoId: item.id, 
      priority: item.priority 
    }, "Adding video to import queue");
    
    this.importQueue.push(item);
    this.updateRenderQueuePriority();
    this.processImportQueue();
  }

  public async processImportQueue(): Promise<void> {
    if (this.isProcessingImport || this.importQueue.length === 0) return;
    this.isProcessingImport = true;

    // Get highest priority item
    this.importQueue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const importItem = this.importQueue.shift();
    if (!importItem) {
      this.isProcessingImport = false;
      return;
    }

    try {
      await this.callbacks.onProcessImportItem(importItem);
    } catch (error) {
      logger.error({ 
        videoId: importItem.id, 
        error 
      }, "Error processing imported video");
    } finally {
      this.isProcessingImport = false;
      this.processImportQueue();
    }
  }

  private updateRenderQueuePriority(): void {
    // Move import-related renders to front of render queue
    const importVideoIds = new Set(this.importQueue.map(item => item.id));
    const priorityRenders = this.renderQueue.filter(id => importVideoIds.has(id));
    const normalRenders = this.renderQueue.filter(id => !importVideoIds.has(id));
    this.renderQueue = [...priorityRenders, ...normalRenders];
  }

  // Queue Status Methods
  public getQueueStatus() {
    return {
      creation: {
        pending: this.creationQueue.length,
        processing: this.isProcessingCreation
      },
      render: {
        pending: this.renderQueue.length,
        processing: this.isProcessingRender
      },
      import: {
        pending: this.importQueue.length,
        processing: this.isProcessingImport
      }
    };
  }

  public clearAllQueues(): void {
    this.creationQueue = [];
    this.renderQueue = [];
    this.importQueue = [];
    this.isProcessingCreation = false;
    this.isProcessingRender = false;
    this.isProcessingImport = false;
  }
}