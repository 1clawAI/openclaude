export const SUBMIT_TX_DESCRIPTION =
  'Submit an on-chain EVM transaction via 1claw Intents API. The transaction is signed by HSM-backed keys and broadcast to the network. Private keys never leave the server.'

export const SUBMIT_TX_PROMPT = `Use this tool to submit on-chain EVM transactions. The private key is managed by 1claw's HSM — you never see it. All transactions are subject to agent guardrails: chain allowlists, recipient allowlists, per-transaction value caps, and daily spending limits. Use testnets (chain: "sepolia") for development.`

export const SIGN_TX_DESCRIPTION =
  'Sign an EVM transaction without broadcasting (BYORPC). Returns the signed transaction hex for manual submission.'

export const SIGN_TX_PROMPT = `Use this tool to sign a transaction without broadcasting it. Useful for MEV protection (Flashbots), batch submission, or custom RPC endpoints.`

export const SIMULATE_TX_DESCRIPTION =
  'Simulate a transaction using Tenderly before signing. Returns success/failure and gas estimates without spending real ETH.'

export const SIMULATE_TX_PROMPT = `Use this tool to dry-run a transaction before committing real funds. Shows revert reasons, gas usage, and state changes.`
