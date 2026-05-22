#!/usr/bin/env bun
/**
 * Cleanup test agents and vaults created during testing.
 */
import { createClient } from '@1claw/sdk'

const HUMAN_KEY = process.env.ONECLAW_HUMAN_KEY
if (!HUMAN_KEY) {
  console.error('Set ONECLAW_HUMAN_KEY environment variable')
  process.exit(1)
}

const BASE_URL = process.env.ONECLAW_BASE_URL ?? 'https://api.1claw.xyz'

async function main() {
  const client = createClient({ baseUrl: BASE_URL, apiKey: HUMAN_KEY })

  // Auth
  const authRes = await client.auth.apiKeyToken({ api_key: HUMAN_KEY })
  if (authRes.error) {
    console.error('Auth failed:', authRes.error.message)
    process.exit(1)
  }
  console.log('Authenticated\n')

  // List agents
  console.log('=== Agents ===')
  const agentsRes = await client.agents.list()
  if (agentsRes.data) {
    const agents = (agentsRes.data as any).agents ?? agentsRes.data
    if (Array.isArray(agents)) {
      for (const agent of agents) {
        const name = agent.name ?? agent.id
        console.log(`  ${agent.id} — ${name}`)
        if (name.startsWith('openclaude-test-agent-')) {
          console.log(`    Deleting...`)
          const delRes = await client.agents.delete(agent.id)
          console.log(`    ${delRes.error ? 'FAIL: ' + delRes.error.message : 'Deleted'}`)
        }
      }
    } else {
      console.log('  Unexpected response:', JSON.stringify(agentsRes.data).slice(0, 200))
    }
  } else {
    console.log('  Error:', agentsRes.error?.message)
  }

  // List vaults
  console.log('\n=== Vaults ===')
  const vaultsRes = await client.vault.list()
  if (vaultsRes.data) {
    const vaults = (vaultsRes.data as any).vaults ?? vaultsRes.data
    if (Array.isArray(vaults)) {
      for (const vault of vaults) {
        const name = vault.name ?? vault.id
        console.log(`  ${vault.id} — ${name}`)
        if (name.startsWith('openclaude-test-')) {
          console.log(`    Deleting...`)
          const delRes = await client.vault.delete(vault.id)
          console.log(`    ${delRes.error ? 'FAIL: ' + delRes.error.message : 'Deleted'}`)
        }
      }
    } else {
      console.log('  Unexpected response:', JSON.stringify(vaultsRes.data).slice(0, 200))
    }
  } else {
    console.log('  Error:', vaultsRes.error?.message)
  }
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
