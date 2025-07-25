import { logger } from "../logger";

export class ServiceContainer {
  private static instance: ServiceContainer;
  private services: Map<string, any> = new Map();

  public static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  public register<T>(name: string, service: T): void {
    this.services.set(name, service);
    logger.debug({ serviceName: name }, "Service registered in container");
  }

  public get<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not found in container`);
    }
    return service as T;
  }

  public has(name: string): boolean {
    return this.services.has(name);
  }

  public unregister(name: string): boolean {
    const removed = this.services.delete(name);
    if (removed) {
      logger.debug({ serviceName: name }, "Service unregistered from container");
    }
    return removed;
  }

  public clear(): void {
    this.services.clear();
    logger.info("Service container cleared");
  }

  public getRegisteredServices(): string[] {
    return Array.from(this.services.keys());
  }
}