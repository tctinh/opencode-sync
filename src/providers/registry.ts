import type { AssistantProvider, AssistantType } from "./types.js";
import { openCodeProvider } from "./opencode.js";
import { claudeCodeProvider } from "./claude-code.js";
import { codexProvider } from "./codex.js";
import { geminiProvider } from "./gemini.js";

class ProviderRegistry {
  private providers = new Map<AssistantType, AssistantProvider>();

  register(provider: AssistantProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: AssistantType): AssistantProvider | undefined {
    return this.providers.get(id);
  }

  getAll(): AssistantProvider[] {
    return Array.from(this.providers.values());
  }

  async getInstalled(): Promise<AssistantProvider[]> {
    const installed: AssistantProvider[] = [];
    for (const provider of this.providers.values()) {
      if (await provider.isInstalled()) {
        installed.push(provider);
      }
    }
    return installed;
  }

  getIds(): AssistantType[] {
    return Array.from(this.providers.keys());
  }

  has(id: AssistantType): boolean {
    return this.providers.has(id);
  }
}

export const registry = new ProviderRegistry();

export function getAllProviders(): AssistantProvider[] {
  return registry.getAll();
}

export async function getInstalledProviders(): Promise<AssistantProvider[]> {
  return registry.getInstalled();
}

export function getProvider(id: AssistantType): AssistantProvider | undefined {
  return registry.get(id);
}

export function registerProvider(provider: AssistantProvider): void {
  registry.register(provider);
}

let initialized = false;

export async function initializeProviders(): Promise<void> {
  if (initialized) return;
  registry.register(openCodeProvider);
  registry.register(claudeCodeProvider);
  registry.register(codexProvider);
  registry.register(geminiProvider);
  initialized = true;
}

export async function getProviders(options?: {
  ids?: AssistantType[];
  installedOnly?: boolean;
}): Promise<AssistantProvider[]> {
  let providers = registry.getAll();

  if (options?.ids && options.ids.length > 0) {
    providers = providers.filter((p) => options.ids!.includes(p.id));
  }

  if (options?.installedOnly) {
    const installed: AssistantProvider[] = [];
    for (const provider of providers) {
      if (await provider.isInstalled()) {
        installed.push(provider);
      }
    }
    return installed;
  }

  return providers;
}
