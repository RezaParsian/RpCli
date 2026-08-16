export type SlashCommandContext = {
	exit: () => void
	toggleThinking: () => void
	toggleSearch: () => void
	toggleLogging: () => void
	init: () => void
	continueTask: () => void
	clear: () => void
	help: () => void
}

export type SlashCommand = {
	name: string
	aliases?: string[]
	description: string
	execute: (context: SlashCommandContext) => void
}

export const slashCommands: SlashCommand[] = [
	{
		name: '/init',
		description: 'Generate AGENTS.md for this repository',
		execute: ({ init }) => {
			init()
		},
	},
	{
		name: '/continue',
		description: 'Keep working on the previous task after the tool-round limit',
		execute({ continueTask }) {
			continueTask()
		},
	},
	{
		name: '/clear',
		description: 'Start a new conversation',
		execute({ clear }) {
			clear()
		},
	},
	{
		name: '/help',
		description: 'Show available commands',
		execute({ help }) {
			help()
		},
	},
	{
		name: '/search',
		description: 'Toggle web search on or off',
		execute({ toggleSearch }) {
			toggleSearch()
		},
	},
	{
		name: '/thinking',
		description: 'Toggle thinking on or off',
		execute({ toggleThinking }) {
			toggleThinking()
		},
	},
	{
		name: '/logging',
		aliases: ['/log'],
		description: 'Toggle saving chat transcripts to disk',
		execute({ toggleLogging }) {
			toggleLogging()
		},
	},
	{
		name: '/exit',
		aliases: ['/quit'],
		description: 'Close the application',
		execute({ exit }) {
			exit()
		},
	},
]

function commandLabel(command: SlashCommand): string {
	const aliases = command.aliases?.length ? ` (${command.aliases.join(', ')})` : ''
	return `**${command.name}**${aliases} — ${command.description}`
}

export function formatSlashCommandHelp(): string {
	const lines = slashCommands.map((command) => `- ${commandLabel(command)}`)
	return ['### Commands', '', ...lines].join('\n')
}

export function resolveSlashCommand(value: string): SlashCommand | undefined {
	const commandName = value.trim().toLowerCase()
	return slashCommands.find((command) => command.name === commandName || command.aliases?.includes(commandName))
}
