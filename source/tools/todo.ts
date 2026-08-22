type Status = 'pending' | 'in-progress' | 'done'

interface Todo {
	id: number
	description: string
	status: Status
	parentId: number | null
	subtaskIds: number[]
}

let todos = new Map<number, Todo>()
let nextId = 1

function getTodo(id: number): Todo {
	const todo = todos.get(id)
	if (!todo) throw new Error(`Todo with id ${id} not found`)
	return todo
}

function getSubtasks(id: number): Todo[] {
	const todo = getTodo(id)
	return todo.subtaskIds.map((subId) => getTodo(subId))
}

function updateParentStatus(parentId: number): void {
	const parent = getTodo(parentId)
	const subtasks = getSubtasks(parentId)
	if (subtasks.length === 0) return
	const allDone = subtasks.every((sub) => sub.status === 'done')
	if (allDone && parent.status !== 'done') {
		parent.status = 'done'
	}
}

function formatTodoList(): string {
	const rootTodos = Array.from(todos.values()).filter((t) => t.parentId === null)
	if (rootTodos.length === 0) return '📋 **Todo List** – No todos yet.'

	const done = Array.from(todos.values()).filter((t) => t.status === 'done').length
	const total = todos.size
	const progress = total > 0 ? Math.round((done / total) * 100) : 0

	const statusIcon = (status: Status) => status === 'done' ? '✅' : status === 'in-progress' ? '🔄' : '⏳'

	let output = `📋 **Todo List** (${done}/${total} done, ${progress}% complete)\n\n`

	for (const todo of rootTodos) {
		const icon = statusIcon(todo.status)
		output += `${icon} [#${todo.id}] ${todo.description}\n`
		for (const subId of todo.subtaskIds) {
			const sub = getTodo(subId)
			const subIcon = statusIcon(sub.status)
			output += `  ↳ ${subIcon} [#${sub.id}] ${sub.description}\n`
		}
	}

	return output
}

function formatTodoListWithMessage(message: string): string {
	return `📌 **${message}**\n\n${formatTodoList()}`
}

export function getTodoList(): string {
	return formatTodoList()
}

export const todoTools = [
	{
		name: 'todo_add',
		description:
			'todo_add(description: string, parent_id?: number) - Adds a new todo. If parent_id is provided, it becomes a subtask of that parent. Returns the new todo id.',
		requiresConfirmation: false,
		async execute(arguments_: Record<string, unknown>, _signal?: AbortSignal) {
			const description = arguments_['description'] as string
			if (!description || typeof description !== 'string') {
				throw new Error('description is required and must be a string')
			}

			let parentId: number | undefined
			if (arguments_['parent_id'] !== undefined) {
				parentId = Number(arguments_['parent_id'])
				if (isNaN(parentId)) {
					throw new Error('parent_id must be a number')
				}
				const parent = getTodo(parentId)
				if (parent.status === 'done') {
					throw new Error('Cannot add subtask to a completed todo')
				}
			}

			const id = nextId++
			const todo: Todo = {
				id,
				description,
				status: 'pending',
				parentId: parentId ?? null,
				subtaskIds: [],
			}
			todos.set(id, todo)

			if (parentId !== undefined) {
				const parent = getTodo(parentId)
				parent.subtaskIds.push(id)
				if (parent.status === 'done') {
					parent.status = 'pending'
				}
			}

			return formatTodoListWithMessage(`Added todo #${id}: "${description}"${parentId ? ` as subtask of #${parentId}` : ''}`)
		},
	},
	{
		name: 'todo_list',
		description: 'todo_list() - Shows all todos with their statuses and progress. Returns a formatted list.',
		requiresConfirmation: false,
		async execute(_arguments: Record<string, unknown>, _signal?: AbortSignal) {
			return formatTodoList()
		},
	},
	{
		name: 'todo_update',
		description:
			'todo_update(id: number, status: "pending" | "in-progress" | "done") - Updates the status of a todo. If a parent becomes done and all subtasks are done, it auto-updates.',
		requiresConfirmation: false,
		async execute(arguments_: Record<string, unknown>, _signal?: AbortSignal) {
			const id = Number(arguments_['id'])
			const status = arguments_['status'] as Status

			if (isNaN(id)) throw new Error('id must be a number')
			if (!status || !['pending', 'in-progress', 'done'].includes(status)) {
				throw new Error('status must be one of: pending, in-progress, done')
			}

			const todo = getTodo(id)
			const oldStatus = todo.status

			if (status === 'done') {
				const subtasks = getSubtasks(id)
				const pendingSubtasks = subtasks.filter((sub) => sub.status !== 'done')
				if (pendingSubtasks.length > 0) {
					throw new Error(`Cannot mark todo as done because it has ${pendingSubtasks.length} pending subtask(s)`)
				}
			}

			todo.status = status

			// If this todo has a parent, update parent status
			if (todo.parentId !== null) {
				updateParentStatus(todo.parentId)
			}

			return formatTodoListWithMessage(`Updated todo #${id} status from "${oldStatus}" to "${status}"`)
		},
	},
	{
		name: 'todo_split',
		description:
			'todo_split(id: number, subtasks: string[]) - Replaces a todo with a list of subtasks. The original todo becomes a parent and its status resets to pending. Returns the subtask ids.',
		requiresConfirmation: false,
		async execute(arguments_: Record<string, unknown>, _signal?: AbortSignal) {
			const id = Number(arguments_['id'])
			let subtaskDescriptions = arguments_['subtasks']

			if (isNaN(id)) throw new Error('id must be a number')

			// Coerce subtasks into an array of strings
			let subtaskArray: string[] = []
			if (typeof subtaskDescriptions === 'string') {
				// Split by newline only (not comma) to avoid character-level splitting
				subtaskArray = subtaskDescriptions.split('\n').map(s => s.trim()).filter(Boolean)
				// If no newlines found but there are commas, treat as a single subtask
				if (subtaskArray.length === 1 && subtaskArray[0]!.includes(',')) {
					// Check if it's a list like "item1, item2, item3" without newlines
					const commaSplit = subtaskArray[0]!.split(',').map(s => s.trim()).filter(Boolean)
					if (commaSplit.length > 1) {
						subtaskArray = commaSplit
					}
				}
			} else if (Array.isArray(subtaskDescriptions)) {
				subtaskArray = subtaskDescriptions.map(s => String(s).trim()).filter(Boolean)
			} else {
				throw new Error('subtasks must be a string with newlines, or an array of strings')
			}

			// Validate: if a single subtask is longer than 200 chars, warn the model
			if (subtaskArray.length === 1 && subtaskArray[0]!.length > 200) {
				throw new Error('Subtasks should be a list of individual tasks (one per line or array item). Single long description detected.')
			}

			if (subtaskArray.length === 0) {
				throw new Error('subtasks must contain at least one non-empty item')
			}

			const todo = getTodo(id)

			// Clear existing subtasks
			for (const subId of todo.subtaskIds) {
				todos.delete(subId)
			}
			todo.subtaskIds = []

			// Create new subtasks
			const subtaskIds: number[] = []
			for (const desc of subtaskArray) {
				const subId = nextId++
				const subTodo: Todo = {
					id: subId,
					description: desc,
					status: 'pending',
					parentId: id,
					subtaskIds: [],
				}
				todos.set(subId, subTodo)
				subtaskIds.push(subId)
			}
			todo.subtaskIds = subtaskIds
			todo.status = 'pending'

			return formatTodoListWithMessage(`Split todo #${id} into ${subtaskIds.length} subtasks: ${subtaskIds.map((sid) => `#${sid}`).join(', ')}`)
		},
	},
	{
		name: 'todo_clear',
		description: 'todo_clear() - Removes all todos.',
		requiresConfirmation: true,
		async execute(_arguments?: Record<string, unknown>, _signal?: AbortSignal) {
			const count = todos.size
			todos.clear()
			nextId = 1
			return formatTodoListWithMessage(`Cleared ${count} todos.`)
		},
	},
]