/**
 * Polyfill for {@link Promise.withResolvers}.
 */
export function mkProm<T>(globalCatch?: boolean): PromiseWithResolvers<T> {
	let res: (value: T | PromiseLike<T>) => void
	let rej: (err: any) => void
	const prom = new Promise<T>((resolve, reject) => {
		res = resolve
		rej = reject
	})

	if (globalCatch) {
		prom.catch(() => {})
	}

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

export const utf8Decoder = new TextDecoder('utf-8')
export const utf8Encoder = new TextEncoder()

// As long as the byte length of an input string is less than 16KiB, we don't need to allocate anything.
const textMeasureBuf = new Uint8Array(16 * 1024)

/**
 * Returns the UTF-8 byte length of a string.
 * @param str The string to measure.
 * @returns The UTF-8 byte length of the string.
 */
export function utf8ByteLen(str: string): number {
	const res = utf8Encoder.encodeInto(str, textMeasureBuf)
	if (res.read < str.length) {
		// Pre-allocated buffer isn't big enough; regrettably use a new buffer.
		return utf8Encoder.encode(str).byteLength
	}

	return res.written
}

/**
 * Tries to resolve the length and (optionally) MIME type of a {@link RequestInit} body.
 * @param body The body to resolve.
 * @returns The length and (optionally) MIME type of the body, or null if the length cannot be determined.
 */
export function tryResolveBody(body: any): { type?: string, len: number } | null {
	if (body == null) {
		return null
	}

	if (typeof body === 'string') {
		return {
			len: utf8ByteLen(body)
		}
	} else if (body instanceof Blob) {
		return {
			len: body.size,
			type: body.type || undefined,
		}
	} else if (typeof body.byteLength === 'number') {
		// ArrayBufferLike
		return {
			len: body.byteLength
		}
	} else if (body instanceof URLSearchParams) {
		return {
			len: utf8ByteLen(body.toString()),
			type: 'application/x-www-form-urlencoded'
		}
	} else if (body instanceof FormData) {
		// Types like FormData are not supported due to inefficiencies and possible inconsistency.
		return null
	} else if (typeof body === 'object') {
		// Can it be made into JSON?
		try {
			const json = JSON.stringify(body)
			return {
				len: utf8ByteLen(json),
				type: 'application/json'
			}
		} catch {}
	}

	// Cannot determine length
	return null
}
