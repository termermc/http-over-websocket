export type BufferedReadableStreamOptions = {
	onCancel?: (reason: unknown) => void | Promise<void>
}

export type BufferedReadableStreamController = {
	enqueue: (chunk: Uint8Array<ArrayBuffer>) => void
	close: () => void
	error: (err?: unknown) => void
	get state(): 'readable' | 'closed' | 'errored' | 'canceled'
}

export function newUnboundedBufferedReadableStream(
	options: BufferedReadableStreamOptions = {},
): [ReadableStream<Uint8Array<ArrayBuffer>>, BufferedReadableStreamController] {
	let controller!: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>

	let state: 'readable' | 'closed' | 'errored' | 'canceled' = 'readable'

	const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
		start(c) {
			controller = c
		},

		cancel(reason) {
			if (state !== 'readable') return

			state = 'canceled'
			void options.onCancel?.(reason)
		},
	})

	const api: BufferedReadableStreamController = {
		enqueue(chunk) {
			if (state !== 'readable') {
				throw new Error(`Cannot enqueue into ${state} stream`)
			}

			controller.enqueue(chunk)
		},

		close() {
			if (state !== 'readable') return

			state = 'closed'
			controller.close()
		},

		error(err) {
			if (state !== 'readable') return

			state = 'errored'
			controller.error(err)
		},

		get state() {
			return state
		},
	}

	return [stream, api]
}
