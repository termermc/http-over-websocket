/**
 * Types of HoWS frames.
 */
export const FrameType = {
	/**
	 * The frame type used for sending a new request.
	 * It must be accompanied by a new request ID.
	 */
	REQUEST: 'q',

	/**
	 * The frame type used for sending a response to a request.
	 */
	RESPONSE: 'a',

	/**
	 * The frame type for sending body data (used for both requests and responses).
	 */
	BODY: 'b',

	/**
	 * The frame type that is sent at the end of a request or response.
	 * It can optionally include trailers.
	 */
	END: 'e',
} as const

/**
 * Types of HoWS frames.
 */
export type FrameType = (typeof FrameType)[keyof typeof FrameType]

/**
 * A header key-value tuple.
 */
export type Header = [string, string]

/**
 * A HoWS frame.
 */
export type Frame = {
	requestId: BigInt
} & (
	| {
			type: 'q'
			request: {
				/**
				 * The request URI.
				 */
				u: string

				/**
				 * The request headers.
				 */
				h: Header[]
			}
	  }
	| {
			type: 'a'
			response: {
				/**
				 * The status code.
				 */
				s: number

				/**
				 * The status message.
				 */
				m: string

				/**
				 * The response headers.
				 */
				h: Header[]
			}
	  }
	| {
			type: 'b'
			buffer: Uint8Array<ArrayBuffer>
	  }
	| {
			type: 'e'
			end: {
				/**
				 * The response trailers.
				 */
				t: Header[]
			}
	  }
)

/**
 * Converts an unsigned little-endian Uint8Array to a BigInt.
 */
export function littleEndianToBigInt(bytes: Uint8Array): bigint {
	let res = 0n

	for (let i = bytes.length - 1; i >= 0; i--) {
		res = (res << 8n) | BigInt(bytes[i]!)
	}

	return res
}

const minMsgLen = 1 + 8

const utf8Decoder = new TextDecoder('utf-8')

/**
 * Like {@link parseFrame}, but uses an {@link ArrayBufferLike}.
 */
function parseFrameArrayBuffer(buf: ArrayBufferLike) {
	return parseFrame(new Uint8Array(buf))
}

// TODO Write benchmark for JSON version and binary version, and see which one performs better in V8

function validateHeaders(h: any, frameType: string, label: string) {
	if (!Array.isArray(h)) {
		throw TypeError(`frame type "${frameType}" expects an array "${label}"`)
	}
	for (const elem of h) {
		if (!Array.isArray(elem) || elem.length !== 2) {
			throw TypeError(
				`frame type "${frameType}" expects array "${label}" elements to be [string, string] tuples`,
			)
		}
	}
}

/**
 * Parses a HoWS frame.
 * @param buf The raw frame buffer.
 * @returns The parsed frame.
 * @throws {TypeError} If the buffer is not a valid HoWS frame.
 */
function parseFrame(buf: Uint8Array): Frame {
	if (buf.byteLength < minMsgLen) {
		throw new TypeError(
			`buffer length is ${buf.byteLength} which is less than the minimum valid length of ${minMsgLen}`,
		)
	}

	const type = String.fromCodePoint(buf[0]!) as FrameType
	const reqId = littleEndianToBigInt(buf.slice(1))

	if (type === FrameType.BODY) {
		return {
			type: FrameType.BODY,
			requestId: reqId,
			buffer: buf.slice(2),
		}
	}

	const json = JSON.parse(utf8Decoder.decode(buf.slice(2)))

	switch (type) {
		case FrameType.REQUEST:
			if (typeof json.u !== 'string') {
				throw TypeError(
					`frame type "${FrameType.REQUEST}" expects string u`,
				)
			}
			validateHeaders(json.h, FrameType.REQUEST, 'h')

			return {
				type: type,
				requestId: reqId,
				request: json,
			}
		case FrameType.RESPONSE:
			if (typeof json.s !== 'number') {
				throw TypeError(
					`frame type "${FrameType.RESPONSE}" expects number "s"`,
				)
			}
			if (json.s < 100 || json.s > 599 || json.s % 1 !== 0) {
				throw TypeError(
					`frame type "${FrameType.RESPONSE}" expects number "s" to be a valid HTTP status code`,
				)
			}
			if (typeof json.m !== 'string') {
				throw TypeError(
					`frame type "${FrameType.RESPONSE}" expects string "m"`,
				)
			}
			validateHeaders(json.h, FrameType.RESPONSE, 'h')

			return {
				type: type,
				requestId: reqId,
				response: json,
			}
		case FrameType.END:
			validateHeaders(json.t, FrameType.END, 't')

			return {
				type: type,
				requestId: reqId,
				end: json,
			}
		default:
			throw new TypeError(
				`frame type "${type}" was not recognized; is the buffer not a HoWS frame?`,
			)
	}
}
