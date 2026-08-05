/**
 * Polyfill for {@link Promise.withResolvers}.
 */
export function mkProm<T>(): PromiseWithResolvers<T> {
	let res: (value: T | PromiseLike<T>) => void
	let rej: (err: any) => void
	const prom = new Promise<T>((resolve, reject) => {
		res = resolve
		rej = reject
	})

	return {
		promise: prom,
		resolve: res!,
		reject: rej!,
	}
}

const maxBufferedAmount = 1024 * 1024 // 1MiB

/**
 * Writes a frame to a {@link WebSocket}. Does its best to wait for drainage if buffer pressure is too high.
 * @param ws The WebSocket to write to.
 * @param buf The buffer to write.
 * @throws {TypeError} If the WebSocket is not open.
 */
export async function writeWs(ws: WebSocket, buf: BufferSource): Promise<void> {
	if (ws.readyState !== WebSocket.OPEN) {
		throw new TypeError('cannot write to WebSocket that is not open')
	}

	while (ws.bufferedAmount >= maxBufferedAmount) {
		// Wait until buffer is reduced or state is closed.
		await new Promise<void>((res) => setTimeout(res, 32))
		if (ws.readyState !== WebSocket.OPEN) {
			throw new TypeError('cannot write to WebSocket that is not open')
		}
	}

	// Ready to write.
	ws.send(buf)
}
