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

function formatTodo(todo: Todo, indent: number = 0): string {
	const prefix = '  '.repeat(indent)
	const statusIcon = todo.status === 'done' ? '✅' : todo.status === 'in-progress' ? '🔄' : '⏳'
	const subtaskCount = todo.subtaskIds.length > 0 ? ` (${todo.subtaskIds.length} subtasks)` : ''
	return `${prefix}${statusIcon} [#${todo.id}] ${todo.description}${subtaskCount}`
}

function formatTodoList(): string {
	const rootTodos = Array.from(todos.values()).filter((t) => t.parentId === null)
	if (rootTodos.length === 0) return 'No todos yet.'

	const done = Array.from(todos.values()).filter((t) => t.status === 'done').length
	const total = todos.size
	const progress = total > 0 ? Math.round((done / total) * 100) : 0

	let output = `📋 **Todo List** (${done}/${total} done, ${progress}% complete)\n\n`

	for (const todo of rootTodos) {
		output += formatTodo(todo) + '\n'
		for (const subId of todo.subtaskIds) {
			const sub = getTodo(subId)
			output += formatTodo(sub, 1) + '\n'
		}
	}

	return output
}

function formatTodoListWithMessage(message: string): string {
	return `${message}\n\n${formatTodoList()}`
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

			const parentId = arguments_['parent_id'] as number | undefined
			if (parentId !== undefined) {
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
			const id = arguments_['id'] as number
			const status = arguments_['status'] as Status

			if (!id || typeof id !== 'number') throw new Error('id must be a number')
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
			const id = arguments_['id'] as number
			const subtaskDescriptions = arguments_['subtasks'] as string[]

			if (!id || typeof id !== 'number') throw new Error('id must be a number')
			if (!Array.isArray(subtaskDescriptions) || subtaskDescriptions.length === 0) {
				throw new Error('subtasks must be a non-empty array of strings')
			}

			const todo = getTodo(id)

			// Clear existing subtasks
			for (const subId of todo.subtaskIds) {
				todos.delete(subId)
			}
			todo.subtaskIds = []

			// Create new subtasks
			const subtaskIds: number[] = []
			for (const desc of subtaskDescriptions) {
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