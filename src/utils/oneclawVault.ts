import { logForDebugging } from './debug.js'
import {
  isOneclawConfigured,
  loadOneclawConfig,
  getSecretPathForProvider,
  shouldSkipVaultForProvider,
  PROVIDER_TO_SECRET_PATH,
} from './oneclaw.js'
import { getAuthenticatedAgentClient } from './oneclawClient.js'

const resolvedCache = new Map<string, string | null>()
let initialized = false

export async function resolveProviderKeyFromVault(
  envKey: string,
): Promise<string | null> {
  if (shouldSkipVaultForProvider(envKey)) return null

  if (resolvedCache.has(envKey)) {
    return resolvedCache.get(envKey) ?? null
  }

  const client = await getAuthenticatedAgentClient()
  if (!client) return null

  const config = loadOneclawConfig()
  if (!config?.vaultId) return null

  const secretPath = getSecretPathForProvider(envKey)

  try {
    const res = await client.secrets.get(config.vaultId, secretPath)
    if (res.error) {
      logForDebugging(`1claw vault: ${envKey} not found at ${secretPath}`)
      resolvedCache.set(envKey, null)
      return null
    }
    const value = res.data?.value ?? null
    resolvedCache.set(envKey, value)
    return value
  } catch (err) {
    logForDebugging(`1claw vault: error resolving ${envKey}: ${err}`)
    resolvedCache.set(envKey, null)
    return null
  }
}

export async function populateEnvFromVault(): Promise<number> {
  if (initialized) return 0
  if (!isOneclawConfigured()) return 0

  const config = loadOneclawConfig()
  if (!config?.vaultId) return 0

  const client = await getAuthenticatedAgentClient()
  if (!client) return 0

  let count = 0

  for (const envKey of Object.keys(PROVIDER_TO_SECRET_PATH)) {
    if (process.env[envKey]) continue
    if (shouldSkipVaultForProvider(envKey)) continue

    try {
      const resolvedPath = getSecretPathForProvider(envKey)
      const res = await client.secrets.get(config.vaultId, resolvedPath)
      if (!res.error && res.data?.value) {
        process.env[envKey] = res.data.value
        resolvedCache.set(envKey, res.data.value)
        count++
        logForDebugging(`1claw vault: loaded ${envKey} from vault`)
      }
    } catch {
      // Non-fatal -- key may not exist in vault
    }
  }

  initialized = true
  return count
}

export function clearVaultCache(): void {
  resolvedCache.clear()
  initialized = false
}

export function isVaultKeyResolutionAvailable(): boolean {
  return isOneclawConfigured()
}
