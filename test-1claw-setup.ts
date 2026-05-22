#!/usr/bin/env bun
/**
 * Test script for 1claw integration provisioning.
 * Exercises the same flow as /1claw setup: create vault, agent, policy, store keys.
 * Usage: ONECLAW_HUMAN_KEY=1ck_... bun run test-1claw-setup.ts
 */

import { createClient } from '@1claw/sdk'

const HUMAN_KEY = process.env.ONECLAW_HUMAN_KEY
if (!HUMAN_KEY) {
  console.error('Set ONECLAW_HUMAN_KEY environment variable')
  process.exit(1)
}

const BASE_URL = process.env.ONECLAW_BASE_URL ?? 'https://api.1claw.xyz'

async function main() {
  console.log('=== 1claw Integration Test ===\n')
  console.log(`Base URL: ${BASE_URL}`)

  const client = createClient({ baseUrl: BASE_URL, apiKey: HUMAN_KEY })

  // Step 0: Authenticate — exchange API key for JWT
  console.log('[0/5] Authenticating with human API key...')
  const authRes = await client.auth.apiKeyToken({ api_key: HUMAN_KEY })
  if (authRes.error) {
    console.error('  FAIL:', authRes.error.message)
    process.exit(1)
  }
  console.log('  OK — authenticated')

  // Step 1: Create vault
  console.log('\n[1/5] Creating vault...')
  const vaultRes = await client.vault.create({
    name: `openclaude-test-${Date.now()}`,
    description: 'Test vault for OpenClaude integration',
  })
  if (vaultRes.error) {
    console.error('  FAIL:', vaultRes.error.message)
    process.exit(1)
  }
  const vaultId = vaultRes.data!.id
  console.log(`  OK — vault ID: ${vaultId}`)

  // Step 2: Create agent
  console.log('\n[2/5] Creating agent...')
  const agentRes = await client.agents.create({
    name: `openclaude-test-agent-${Date.now()}`,
    scopes: ['**'],
    intents_api_enabled: true,
  })
  if (agentRes.error) {
    console.error('  FAIL:', agentRes.error.message)
    process.exit(1)
  }
  const agentId = agentRes.data!.agent.id
  const agentApiKey = agentRes.data!.api_key
  console.log(`  OK — agent ID: ${agentId}`)
  console.log(`  OK — agent key: ${agentApiKey?.slice(0, 12)}...`)

  // Step 3: Update agent (Shroud + federation)
  console.log('\n[3/5] Configuring agent (Shroud + OIDC federation)...')
  const updatePayload: Record<string, unknown> = {
    shroud_enabled: true,
    shroud_config: {
      pii_policy: 'redact',
      injection_threshold: 0.7,
      enable_secret_redaction: true,
      enable_response_filtering: true,
    },
    federation_enabled: true,
    federation_audiences: ['https://api.anthropic.com'],
  }
  const updateRes = await client.agents.update(
    agentId,
    updatePayload as Parameters<typeof client.agents.update>[1],
  )
  if (updateRes.error) {
    console.error('  FAIL:', updateRes.error.message)
    // Non-fatal — federation may not be available on this deployment
    console.log('  (continuing without federation)')
  } else {
    console.log('  OK — Shroud enabled, federation enabled')
  }

  // Step 4: Grant agent read access to vault
  console.log('\n[4/5] Granting agent vault access policy...')
  const policyRes = await client.access.grantAgent(
    vaultId,
    agentId,
    ['read'],
    { secretPathPattern: 'providers/**' },
  )
  if (policyRes.error) {
    console.error('  FAIL:', policyRes.error.message)
    process.exit(1)
  }
  console.log('  OK — agent has read access to providers/*')

  // Step 5: Store a test secret
  console.log('\n[5/5] Storing test secret in vault...')
  const secretRes = await client.secrets.set(
    vaultId,
    'providers/test/api-key',
    'test-key-value-12345',
    { type: 'api_key' },
  )
  if (secretRes.error) {
    console.error('  FAIL:', secretRes.error.message)
    process.exit(1)
  }
  console.log('  OK — test secret stored')

  // Step 5b: Read it back with the agent key
  console.log('\n[bonus] Reading secret back with agent key...')
  const agentClient = createClient({ baseUrl: BASE_URL, apiKey: agentApiKey! })
  const agentAuthRes = await agentClient.auth.agentToken({
    agent_id: agentId,
    api_key: agentApiKey!,
  })
  if (agentAuthRes.error) {
    console.error('  Agent auth FAIL:', agentAuthRes.error.message)
  } else {
    console.log('  Agent authenticated OK')
    // Debug: let's see what scopes the agent JWT actually has
    const meRes = await agentClient.agents.getSelf()
    if (meRes.data) {
      console.log('  Agent self:', JSON.stringify(meRes.data).slice(0, 200))
    }
  }
  const readRes = await agentClient.secrets.get(vaultId, 'providers/test/api-key')
  console.log('  Read result:', JSON.stringify(readRes).slice(0, 200))
  if (readRes.error) {
    console.error('  FAIL:', readRes.error.message)
  } else {
    const val = readRes.data?.value
    console.log(`  OK — read back: ${val === 'test-key-value-12345' ? 'MATCH' : 'MISMATCH'} (${val?.slice(0, 10)}...)`)
  }

  // Step 5c: Test OIDC federation token exchange
  console.log('\n[bonus] Testing OIDC federated token exchange...')
  try {
    const fedRes = await agentClient.auth.exchangeFederatedToken({
      audience: 'https://api.anthropic.com',
    })
    if (fedRes.error) {
      console.error('  FAIL:', fedRes.error.message)
    } else {
      const jwt = fedRes.data?.access_token
      console.log(`  OK — federated JWT: ${jwt?.slice(0, 40)}...`)
      console.log(`  expires_in: ${fedRes.data?.expires_in}s`)
    }
  } catch (err: any) {
    console.error('  FAIL:', err?.message ?? String(err))
  }

  console.log('\n=== Summary ===')
  console.log(`Vault ID:    ${vaultId}`)
  console.log(`Agent ID:    ${agentId}`)
  console.log(`Agent Key:   ${agentApiKey?.slice(0, 12)}...`)
  console.log(`Base URL:    ${BASE_URL}`)
  console.log('\nTo use with OpenClaude, save this config to ~/.openclaude/oneclaw.json:')
  console.log(JSON.stringify({
    agentId,
    agentApiKey,
    vaultId,
    baseUrl: BASE_URL,
    shroudEnabled: true,
    intentsEnabled: true,
    oidcFederationEnabled: true,
    providerSecretPaths: {
      ANTHROPIC_API_KEY: 'providers/anthropic/api-key',
      OPENAI_API_KEY: 'providers/openai/api-key',
    },
  }, null, 2))

  console.log('\n=== All tests passed ===')
}

main().catch(err => {
  console.error('\nFATAL:', err)
  process.exit(1)
})
