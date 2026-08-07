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
 * A list of all supported HTTP methods.
 */
export const httpMethods = [
	'GET',
	'HEAD',
	'POST',
	'PUT',
	'DELETE',
	'CONNECT',
	'OPTIONS',
	'TRACE',
	'PATCH',
] as const

/**
 * A valid HTTP method.
 */
export type HttpMethod = typeof httpMethods[number]

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
	/**
	 * The request's unique ID.
	 */
	requestId: bigint
} & (
	| {
			type: 'q'
			request: {
				/**
				 * The request method.
				 */
				m: HttpMethod

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
			body: Uint8Array<ArrayBuffer>
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

const minMsgLen = 1 + 8

const utf8Decoder = new TextDecoder('utf-8')
const utf8Encoder = new TextEncoder()

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
 * Decodes a HoWS frame.
 * @param buf The raw frame buffer.
 * @returns The decoded frame.
 * @throws {TypeError} If the buffer is not a valid HoWS frame.
 */
export function decodeFrame(buf: Uint8Array<ArrayBufferLike>): Frame {
	if (buf.byteLength < minMsgLen) {
		throw new TypeError(
			`buffer length is ${buf.byteLength} which is less than the minimum valid length of ${minMsgLen}`,
		)
	}

	const type = String.fromCodePoint(buf[0]!) as FrameType
	const reqId = new DataView(buf.buffer).getBigInt64(1, true)

	if (type === FrameType.BODY) {
		return {
			type: FrameType.BODY,
			requestId: reqId,
			body: new Uint8Array(buf.subarray(minMsgLen)),
		}
	}

	const json = JSON.parse(utf8Decoder.decode(buf.subarray(minMsgLen)))

	switch (type) {
		case FrameType.REQUEST:
			if (typeof json.m !== 'string') {
				throw TypeError(
					`frame type "${FrameType.REQUEST}" expects string m`,
				)
			}
			if (!httpMethods.includes(json.m)) {
				throw TypeError(
					`frame type "${FrameType.REQUEST}" expects string m to be a valid HTTP method`,
				)
			}
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

/**
 * Encodes a frame to a buffer.
 * @param frame The HoWS frame to encode.
 * @returns The encoded frame buffer.
 */
export function encodeFrame(frame: Frame): Uint8Array<ArrayBuffer> {
	if (frame.type === FrameType.BODY) {
		const buf = new Uint8Array(minMsgLen + frame.body.length)
		buf[0] = FrameType.BODY.codePointAt(0)!
		new DataView(buf.buffer).setBigInt64(1, frame.requestId, true)
		for (let i = 0; i < frame.body.length; i++) {
			buf[i + minMsgLen] = frame.body[i]!
		}
		return buf
	}

	let json: string
	switch (frame.type) {
		case FrameType.REQUEST:
			json = JSON.stringify(frame.request)
			break
		case FrameType.RESPONSE:
			json = JSON.stringify(frame.response)
			break
		case FrameType.END:
			json = JSON.stringify(frame.end)
			break
	}

	const buf = new Uint8Array(minMsgLen + json.length)
	buf[0] = frame.type.codePointAt(0)!
	new DataView(buf.buffer).setBigInt64(1, frame.requestId, true)
	utf8Encoder.encodeInto(json, buf.subarray(minMsgLen))

	return buf
}
