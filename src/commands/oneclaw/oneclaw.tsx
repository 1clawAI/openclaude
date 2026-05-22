import * as React from 'react'
import { useState, useEffect } from 'react'
import { Box, Text } from '../../ink.js'
import TextInput from '../../components/TextInput.js'
import {
  Select,
  type OptionWithDescription,
} from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { LoadingState } from '../../components/design-system/LoadingState.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import {
  loadOneclawConfig,
  saveOneclawConfig,
  getOneclawBaseUrl,
  PROVIDER_TO_SECRET_PATH,
  type OneclawConfig,
} from '../../utils/oneclaw.js'
import {
  createOneclawHumanClient,
  resetOneclawClientCache,
} from '../../utils/oneclawClient.js'

type SetupStep =
  | 'menu'
  | 'enter-key'
  | 'provisioning'
  | 'done'
  | 'status'
  | 'disable'
  | 'error'

function OneclawSetup({
  onDone,
  initialAction,
}: {
  onDone: (result?: string) => void
  initialAction?: string
}) {
  const [step, setStep] = useState<SetupStep>(() => {
    if (initialAction === 'status') return 'status'
    if (initialAction === 'disable') return 'disable'
    return 'menu'
  })
  const [humanKey, setHumanKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<OneclawConfig | null>(null)
  const [statusInfo, setStatusInfo] = useState<string | null>(null)
  const [cursorOffset, setCursorOffset] = useState(0)
  const { columns } = useTerminalSize()

  useEffect(() => {
    if (step === 'status') {
      const config = loadOneclawConfig()
      if (!config) {
        setStatusInfo('1claw is not configured. Run /1claw to set up.')
      } else {
        const lines = [
          `Agent ID: ${config.agentId}`,
          `Vault ID: ${config.vaultId}`,
          `Base URL: ${config.baseUrl}`,
          `Shroud: ${config.shroudEnabled ? 'enabled' : 'disabled'}`,
          `Intents API: ${config.intentsEnabled ? 'enabled' : 'disabled'}`,
          `OIDC Federation: ${config.oidcFederationEnabled ? 'enabled' : 'disabled'}`,
        ]
        setStatusInfo(lines.join('\n'))
      }
    }
  }, [step])

  useEffect(() => {
    if (step === 'disable') {
      const config = loadOneclawConfig()
      if (!config) {
        onDone('1claw is not configured.')
        return
      }
      const emptyConfig: OneclawConfig = {
        agentId: '',
        agentApiKey: '',
        vaultId: '',
        baseUrl: '',
        shroudEnabled: false,
        intentsEnabled: false,
        oidcFederationEnabled: false,
        providerSecretPaths: {},
      }
      saveOneclawConfig(emptyConfig)
      resetOneclawClientCache()
      onDone('1claw integration disabled.')
    }
  }, [step, onDone])

  async function runProvisioning(apiKey: string) {
    setStep('provisioning')
    try {
      const baseUrl = getOneclawBaseUrl()
      const humanClient = createOneclawHumanClient(apiKey)

      const vaultRes = await humanClient.vault.create({
        name: 'openclaude-providers',
        description: 'LLM provider API keys managed by OpenClaude',
      })
      if (vaultRes.error) {
        throw new Error(`Failed to create vault: ${vaultRes.error.message}`)
      }
      const vaultId = vaultRes.data!.id

      const agentRes = await humanClient.agents.create({
        name: 'openclaude-agent',
        scopes: ['secrets/*'],
        intents_api_enabled: true,
        shroud_enabled: true,
        shroud_config: {
          pii_policy: 'redact',
          injection_threshold: 0.7,
          enable_secret_redaction: true,
          enable_response_filtering: true,
        },
      })
      if (agentRes.error) {
        throw new Error(`Failed to create agent: ${agentRes.error.message}`)
      }
      const agentId = agentRes.data!.agent.id
      const agentApiKey = agentRes.data!.api_key

      if (!agentApiKey) {
        throw new Error('Agent created but no API key returned')
      }

      const policyRes = await humanClient.access.grantAgent(
        vaultId,
        agentId,
        ['read'],
        { secretPathPattern: 'providers/*' },
      )
      if (policyRes.error) {
        throw new Error(`Failed to create policy: ${policyRes.error.message}`)
      }

      const config: OneclawConfig = {
        agentId,
        agentApiKey,
        vaultId,
        baseUrl,
        shroudEnabled: true,
        intentsEnabled: true,
        oidcFederationEnabled: false,
        providerSecretPaths: { ...PROVIDER_TO_SECRET_PATH },
      }
      saveOneclawConfig(config)
      resetOneclawClientCache()

      setResult(config)
      setStep('done')
    } catch (err: any) {
      setError(err?.message ?? String(err))
      setStep('error')
    }
  }

  if (step === 'status') {
    return (
      <Dialog>
        <Box flexDirection="column" gap={1}>
          <Text bold>1claw Integration Status</Text>
          {statusInfo && <Text>{statusInfo}</Text>}
          <Text dimColor>Press Enter to continue.</Text>
        </Box>
      </Dialog>
    )
  }

  if (step === 'error') {
    return (
      <Dialog>
        <Box flexDirection="column" gap={1}>
          <Text bold color="red">Setup failed</Text>
          <Text>{error}</Text>
          <Text dimColor>Check your API key and try again with /1claw</Text>
        </Box>
      </Dialog>
    )
  }

  if (step === 'done' && result) {
    return (
      <Dialog>
        <Box flexDirection="column" gap={1}>
          <Text bold color="green">1claw setup complete</Text>
          <Text>Agent ID: {result.agentId}</Text>
          <Text>Vault ID: {result.vaultId}</Text>
          <Text dimColor>Agent API key saved to ~/.openclaude/oneclaw.json</Text>
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Next steps:</Text>
            <Text>  1. Store provider keys in vault via 1claw dashboard</Text>
            <Text>     or run: openclaude with /provider and select 1claw</Text>
            <Text>  2. Shroud proxy is enabled — LLM traffic will be inspected</Text>
            <Text>  3. Intents API is enabled for on-chain transactions</Text>
          </Box>
        </Box>
      </Dialog>
    )
  }

  if (step === 'provisioning') {
    return (
      <Dialog>
        <LoadingState label="Provisioning 1claw agent, vault, and policies..." />
      </Dialog>
    )
  }

  if (step === 'enter-key') {
    return (
      <Dialog>
        <Box flexDirection="column" gap={1}>
          <Text bold>Enter your 1claw human API key</Text>
          <Text dimColor>
            Get one at https://1claw.xyz → Settings → API Keys (1ck_ prefix)
          </Text>
          <Text dimColor>
            This key is used once to provision resources and is not stored.
          </Text>
          <Box>
            <Text>API Key: </Text>
            <TextInput
              value={humanKey}
              onChange={setHumanKey}
              onSubmit={async (value: string) => {
                const trimmed = value.trim()
                if (!trimmed) return
                await runProvisioning(trimmed)
              }}
              placeholder="1ck_..."
              columns={columns - 12}
              cursorOffset={cursorOffset}
              onChangeCursorOffset={setCursorOffset}
              focus
              showCursor
            />
          </Box>
        </Box>
      </Dialog>
    )
  }

  const existingConfig = loadOneclawConfig()
  const menuOptions: OptionWithDescription[] = existingConfig?.agentId
    ? [
        { label: 'Reconfigure', value: 'setup', description: 'Set up a new agent and vault' },
        { label: 'Status', value: 'status', description: 'Show current 1claw configuration' },
        { label: 'Disable', value: 'disable', description: 'Disable 1claw integration' },
        { label: 'Cancel', value: 'cancel', description: 'Go back' },
      ]
    : [
        { label: 'Set up 1claw', value: 'setup', description: 'Provision agent, vault, and policies' },
        { label: 'Cancel', value: 'cancel', description: 'Go back' },
      ]

  return (
    <Dialog>
      <Box flexDirection="column" gap={1}>
        <Text bold>1claw — HSM-backed secrets, Shroud proxy, Intents API</Text>
        <Text dimColor>
          Securely store provider API keys, proxy LLM traffic through Shroud,
          and sign on-chain transactions — all without plaintext keys on disk.
        </Text>
        <Select
          options={menuOptions}
          onChange={(value: string) => {
            switch (value) {
              case 'setup':
                setStep('enter-key')
                break
              case 'status':
                setStep('status')
                break
              case 'disable':
                setStep('disable')
                break
              case 'cancel':
                onDone()
                break
            }
          }}
        />
      </Box>
    </Dialog>
  )
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const trimmed = args.trim().toLowerCase()
  return <OneclawSetup onDone={onDone} initialAction={trimmed || undefined} />
}
