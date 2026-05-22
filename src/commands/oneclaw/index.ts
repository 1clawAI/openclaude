import type { Command } from '../../commands.js'

const oneclaw = {
  type: 'local-jsx',
  name: '1claw',
  aliases: ['oneclaw'],
  description: 'Set up 1claw Vault, Shroud, and Intents integration',
  argumentHint: '[setup|status|disable]',
  load: () => import('./oneclaw.js'),
} satisfies Command

export default oneclaw
