import { createClient, type OneclawClient } from '@1claw/sdk'
import {
  getOneclawBaseUrl,
  getOneclawAgentApiKey,
  getOneclawAgentId,
  loadOneclawConfig,
} from './oneclaw.js'

let cachedAgentClient: OneclawClient | null = null

export function getOneclawAgentClient(): OneclawClient | null {
  if (cachedAgentClient) return cachedAgentClient

  const apiKey = getOneclawAgentApiKey()
  if (!apiKey) return null

  const agentId = getOneclawAgentId()
  const baseUrl = getOneclawBaseUrl()

  cachedAgentClient = createClient({
    baseUrl,
    apiKey,
    ...(agentId ? { agentId } : {}),
  })

  return cachedAgentClient
}

export function createOneclawHumanClient(apiKey: string): OneclawClient {
  return createClient({
    baseUrl: getOneclawBaseUrl(),
    apiKey,
  })
}

export function resetOneclawClientCache(): void {
  cachedAgentClient = null
}

export async function resolveSecretFromVault(
  secretPath: string,
): Promise<string | null> {
  const client = getOneclawAgentClient()
  if (!client) return null

  const config = loadOneclawConfig()
  if (!config?.vaultId) return null

  try {
    const res = await client.secrets.get(config.vaultId, secretPath)
    if (res.error) return null
    return res.data?.value ?? null
  } catch {
    return null
  }
}
