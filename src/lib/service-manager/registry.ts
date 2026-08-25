import type { ServiceDefinition } from './types';

const services = new Map<string, ServiceDefinition>();

export function registerService(def: ServiceDefinition) {
  if (services.has(def.id)) {
    throw new Error(`ServiceManager: duplicate service id "${def.id}"`);
  }
  services.set(def.id, def);
}

export function getService(id: string): ServiceDefinition | undefined {
  return services.get(id);
}

export function requireService(id: string): ServiceDefinition {
  const def = services.get(id);
  if (!def) {
    throw new Error(`ServiceManager: unknown service id "${def}"`);
  }
  return def;
}

export function listServices(): ServiceDefinition[] {
  return Array.from(services.values());
}
