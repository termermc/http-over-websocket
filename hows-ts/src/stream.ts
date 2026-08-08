/**
 * Options for {@link newUnboundedBufferedReadableStream}.
 */
export type BufferedReadableStreamOptions = {
	/**
	 * Callback called when the stream is cancelled.
	 */
	onCancel?: (reason: unknown) => void | Promise<void>
}

/**
 * Controls a {@link ReadableStream} created by {@link newUnboundedBufferedReadableStream}.
 */
export type BufferedReadableStreamController = {
	/**
	 * Enqueues a new chunk to the internal buffer.
	 */
	enqueue: (chunk: Uint8Array<ArrayBufferLike>) => void

	/**
	 * Closes the stream.
	 * Consumers will be able to read the remaining enqueued chunks.
	 */
	close: () => void

	/**
	 * Immediately closes the stream with an error.
	 * Consumers will not be able to read remaining enqueued chunks.
	 */
	error: (err?: unknown) => void

	/**
	 * The state of the stream.
	 */
	get state(): 'readable' | 'closed' | 'errored' | 'canceled'
}

/**
 * Creates a new {@link ReadableStream} backed by an unbounded queue.
 * @param options
 */
export function newUnboundedBufferedReadableStream(
	options: BufferedReadableStreamOptions = {},
): [ReadableStream<Uint8Array<ArrayBuffer>>, BufferedReadableStreamController] {
	let controller!: ReadableStreamDefaultController<
		Uint8Array<ArrayBufferLike>
	>

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
