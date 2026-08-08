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

const errWebSocketNotOpen = new TypeError(
	'cannot write to WebSocket that is not open',
)

/**
 * Writes a frame to a {@link WebSocket}. Does its best to wait for drainage if buffer pressure is too high.
 * @param ws The WebSocket to write to.
 * @param buf The buffer to write.
 * @throws {TypeError} If the WebSocket is not open.
 */
export async function writeWs(ws: WebSocket, buf: BufferSource): Promise<void> {
	if (ws.readyState !== WebSocket.OPEN) {
		throw errWebSocketNotOpen
	}

	while (ws.bufferedAmount >= maxBufferedAmount) {
		// Wait until buffer is reduced or state is closed.
		await new Promise<void>((res) => setTimeout(res, 32))
		if (ws.readyState !== WebSocket.OPEN) {
			throw errWebSocketNotOpen
		}
	}

	// Ready to write.
	ws.send(buf)
}

// Instantiated globally to avoid allocation for every randomBigInt call.
const bigIntBuf = new Uint8Array(8)
const bigIntView = new DataView(bigIntBuf.buffer)

/**
 * Returns a new random BigInt.
 * @returns A random BigInt.
 */
export function randomBigInt(): bigint {
	crypto.getRandomValues(bigIntBuf)
	return bigIntView.getBigInt64(0)
}
