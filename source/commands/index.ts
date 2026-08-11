export type SlashCommandContext = {
	exit: () => void
	toggleThinking: () => void
	toggleSearch: () => void
	init: () => void
}

export type SlashCommand = {
	name: string
	aliases?: string[]
	description: string
	execute: (context: SlashCommandContext) => void
}

// Add new interactive commands here; the picker and parser update automatically.
export const slashCommands: SlashCommand[] = [
	{
		name: '/init',
		description: '',
		execute: ({ init }) => {
			init()
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
		name: '/exit',
		aliases: ['/quit'],
		description: 'Close the application',
		execute({ exit }) {
			exit()
		},
	},
]

export function resolveSlashCommand(value: string): SlashCommand | undefined {
	const commandName = value.trim().toLowerCase()
	return slashCommands.find((command) => command.name === commandName || command.aliases?.includes(commandName))
}
