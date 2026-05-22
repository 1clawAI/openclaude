import { logForDebugging } from './debug.js'
import {
  isOneclawConfigured,
  loadOneclawConfig,
  getShroudBaseUrl,
  getOneclawAgentApiKey,
  getOneclawAgentId,
  getSecretPathForProvider,
} from './oneclaw.js'
import { isEnvTruthy } from './envUtils.js'

export interface ShroudRoutingResult {
  baseUrl: string
  headers: Record<string, string>
  providerHint: string
}

const PROVIDER_ENV_TO_SHROUD_PROVIDER: Record<string, string> = {
  OPENAI_API_KEY: 'openai',
  ANTHROPIC_API_KEY: 'anthropic',
  GEMINI_API_KEY: 'google',
  GOOGLE_API_KEY: 'google',
  MISTRAL_API_KEY: 'mistral',
}

export function isShroudEnabled(): boolean {
  if (isEnvTruthy(process.env.ONECLAW_SHROUD_DISABLED)) return false
  if (isEnvTruthy(process.env.ONECLAW_SHROUD_ENABLED)) return true

  const config = loadOneclawConfig()
  return config?.shroudEnabled === true
}

export function getShroudProvider(): string | null {
  if (process.env.ONECLAW_SHROUD_PROVIDER) {
    return process.env.ONECLAW_SHROUD_PROVIDER
  }

  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_GEMINI)) return 'google'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_MISTRAL)) return 'mistral'

  if (process.env.OPENAI_API_KEY || isEnvTruthy(process.env.CLAUDE_CODE_USE_OPENAI)) {
    return 'openai'
  }

  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'

  return 'openai'
}

export function buildShroudHeaders(options?: {
  model?: string
  provider?: string
}): Record<string, string> {
  const agentApiKey = getOneclawAgentApiKey()
  const agentId = getOneclawAgentId()

  if (!agentApiKey || !agentId) return {}

  const provider = options?.provider ?? getShroudProvider() ?? 'openai'

  const headers: Record<string, string> = {
    'X-Shroud-Agent-Key': `${agentId}:${agentApiKey}`,
    'X-Shroud-Provider': provider,
  }

  const config = loadOneclawConfig()
  if (config?.vaultId) {
    const envKey = Object.entries(PROVIDER_ENV_TO_SHROUD_PROVIDER).find(
      ([_, p]) => p === provider,
    )?.[0]
    if (envKey) {
      const secretPath = getSecretPathForProvider(envKey)
      headers['X-Shroud-Api-Key'] = `vault://${config.vaultId}/${secretPath}`
    }
  }

  if (options?.model) {
    headers['X-Shroud-Model'] = options.model
  }

  return headers
}

export function applyShroudRouting(options?: {
  model?: string
  provider?: string
}): ShroudRoutingResult | null {
  if (!isShroudEnabled()) return null
  if (!isOneclawConfigured()) return null

  const provider = options?.provider ?? getShroudProvider() ?? 'openai'
  const headers = buildShroudHeaders({ ...options, provider })

  if (!headers['X-Shroud-Agent-Key']) return null

  const baseUrl = getShroudBaseUrl()

  logForDebugging(`[Shroud] routing to ${baseUrl} via provider=${provider}`)

  return {
    baseUrl: `${baseUrl}/v1`,
    headers,
    providerHint: provider,
  }
}
