/**
 * This module implements a binary codec for HoWS frames.
 * It was counterintuitively proven to be slower than the JSON version on Node v26.5.1 (V8).
 * @module
 * @deprecated This module is included for historical purposes only.
 */

import {
	type Frame,
	FrameType,
	type Header,
	type HttpMethod,
	httpMethods,
} from './parse.js'

/**
 * A mapping of HTTP method names to their binary IDs.
 */
const httpMethodToId: Record<HttpMethod, number> = {
	GET: 0,
	HEAD: 1,
	POST: 2,
	PUT: 3,
	DELETE: 4,
	CONNECT: 5,
	OPTIONS: 6,
	TRACE: 7,
	PATCH: 8,
}

const minMsgLen = 1 + 8

const utf8Decoder = new TextDecoder('utf-8')
const utf8Encoder = new TextEncoder()

/**
 * Decodes binary headers starting at the specified cursor.
 * Cannot update cursor and does not return the new cursor, so this should be called after all other decoding.
 * @param buf The buffer
 * @param view A view into the buffer
 * @param cursor The current cursor into the buffer
 * @returns The decoded headers
 * @deprecated This module is included for historical purposes only.
 */
function decodeBinaryHeaders(
	buf: Uint8Array,
	view: DataView,
	cursor: number,
): Header[] {
	const headerCount = view.getUint8(cursor)
	cursor++

	const headers = new Array<Header>(headerCount)
	for (let i = 0; i < headerCount; i++) {
		const keyLen = view.getUint16(cursor, true)
		cursor += 2
		const valLen = view.getUint16(cursor, true)
		cursor += 2

		let key = ''
		if (keyLen !== 0) {
			key = utf8Decoder.decode(buf.subarray(cursor, cursor + keyLen))
			cursor += keyLen
		}
		let val = ''
		if (valLen !== 0) {
			val = utf8Decoder.decode(buf.subarray(cursor, cursor + valLen))
			cursor += valLen
		}

		headers[i] = [key, val]
	}

	return headers
}

/**
 * Decodes a HoWS frame.
 * @param buf The raw frame buffer.
 * @returns The decoded frame.
 * @throws {TypeError} If the buffer is not a valid HoWS frame.
 * @deprecated This module is included for historical purposes only.
 */
export function decodeFrameBin(buf: Uint8Array<ArrayBufferLike>): Frame {
	if (buf.byteLength < minMsgLen) {
		throw new TypeError(
			`buffer length is ${buf.byteLength} which is less than the minimum valid length of ${minMsgLen}`,
		)
	}

	const type = String.fromCodePoint(buf[0]!) as FrameType
	const view = new DataView(buf.buffer)
	const reqId = view.getBigInt64(1, true)

	if (type === FrameType.BODY) {
		return {
			type: FrameType.BODY,
			requestId: reqId,
			body: new Uint8Array(buf.subarray(minMsgLen)),
		}
	}

	let cursor = minMsgLen
	switch (type) {
		case FrameType.REQUEST: {
			const methodId = view.getUint8(cursor)
			cursor++

			const method = httpMethods[methodId]
			if (method === undefined) {
				throw new TypeError(`invalid method ID ${methodId}`)
			}

			const uriLen = view.getUint16(cursor, true)
			cursor += 2

			const uri = utf8Decoder.decode(
				buf.subarray(cursor, cursor + uriLen),
			)
			cursor += uriLen

			const headers = decodeBinaryHeaders(buf, view, cursor)

			return {
				type: type,
				requestId: reqId,
				request: {
					m: method,
					u: uri,
					h: headers,
				},
			}
		}
		case FrameType.RESPONSE: {
			const status = view.getUint16(cursor, true)
			cursor += 2

			const msgLen = view.getUint8(cursor)
			cursor++

			const msg = utf8Decoder.decode(
				buf.subarray(cursor, cursor + msgLen),
			)
			cursor += msgLen

			const headers = decodeBinaryHeaders(buf, view, cursor)

			return {
				type: type,
				requestId: reqId,
				response: {
					s: status,
					m: msg,
					h: headers,
				},
			}
		}
		case FrameType.END:
			const trailers = decodeBinaryHeaders(buf, view, cursor)

			return {
				type: type,
				requestId: reqId,
				end: {
					t: trailers,
				},
			}
		default:
			throw new TypeError(
				`frame type "${type}" was not recognized; is the buffer not a HoWS frame?`,
			)
	}
}

function calcBinaryHeadersSize(headers: Header[]): number {
	let size = 1 // Header len byte

	for (const [k, v] of headers) {
		// Header key and value lengths
		size += 2 + 2

		// Key and value lengths
		size += k.length
		size += v.length
	}

	return size
}

/**
 * Encodes binary headers starting at the specified cursor.
 * Cannot update cursor and does not return the new cursor, so this should be called after all other encoding.
 * @param buf The buffer
 * @param view A view into the buffer
 * @param cursor The current cursor into the buffer
 * @param headers The headers to encode
 */
function encodeBinaryHeaders(
	buf: Uint8Array,
	view: DataView,
	cursor: number,
	headers: Header[],
) {
	view.setUint8(cursor, headers.length)
	cursor++

	for (let i = 0; i < headers.length; i++) {
		const [k, v] = headers[i]!

		view.setUint16(cursor, k.length, true)
		cursor += 2
		view.setUint16(cursor, v.length, true)
		cursor += 2

		if (k.length !== 0) {
			utf8Encoder.encodeInto(k, buf.subarray(cursor, cursor + k.length))
			cursor += k.length
		}
		if (v.length !== 0) {
			utf8Encoder.encodeInto(v, buf.subarray(cursor, cursor + v.length))
			cursor += v.length
		}
	}
}

/**
 * Encodes a frame to a buffer.
 * @param frame The HoWS frame to encode.
 * @returns The encoded frame buffer.
 * @deprecated This module is included for historical purposes only.
 */
export function encodeFrameBin(frame: Frame): Uint8Array<ArrayBuffer> {
	if (frame.type === FrameType.BODY) {
		const buf = new Uint8Array(minMsgLen + frame.body.length)
		buf[0] = FrameType.BODY.codePointAt(0)!
		new DataView(buf.buffer).setBigInt64(1, frame.requestId, true)
		for (let i = 0; i < frame.body.length; i++) {
			buf[i + minMsgLen] = frame.body[i]!
		}
		return buf
	}

	let size = minMsgLen

	switch (frame.type) {
		case FrameType.REQUEST:
			const req = frame.request

			// Method ID
			size++

			// URI len
			size += 2

			// URI
			size += req.u.length

			// Headers
			size += calcBinaryHeadersSize(req.h)

			break
		case FrameType.RESPONSE:
			const res = frame.response

			// Status code
			size += 2

			// Status text length
			size++

			// Status text
			size += res.m.length

			// Headers
			size += calcBinaryHeadersSize(res.h)

			break
		case FrameType.END:
			const end = frame.end

			// Trailers
			size += calcBinaryHeadersSize(end.t)

			break
	}

	const buf = new Uint8Array(size)
	const view = new DataView(buf.buffer)
	let cursor = 0

	buf[0] = frame.type.codePointAt(0)!
	cursor++

	view.setBigInt64(cursor, frame.requestId, true)
	cursor += 8

	switch (frame.type) {
		case FrameType.REQUEST:
			const req = frame.request

			const methodId = httpMethodToId[req.m]
			if (methodId === undefined) {
				throw new TypeError(`unknown HTTP method "${req.m}"`)
			}

			view.setUint8(cursor, methodId)
			cursor++

			view.setUint16(cursor, req.u.length, true)
			cursor += 2

			utf8Encoder.encodeInto(
				req.u,
				buf.subarray(cursor, cursor + req.u.length),
			)
			cursor += req.u.length

			encodeBinaryHeaders(buf, view, cursor, req.h)

			break
		case FrameType.RESPONSE:
			const res = frame.response

			view.setUint16(cursor, res.s, true)
			cursor += 2

			view.setUint8(cursor, res.m.length)
			cursor++

			utf8Encoder.encodeInto(
				res.m,
				buf.subarray(cursor, cursor + res.m.length),
			)
			cursor += res.m.length

			encodeBinaryHeaders(buf, view, cursor, res.h)

			break
		case FrameType.END:
			const end = frame.end

			encodeBinaryHeaders(buf, view, cursor, end.t)

			break
	}

	return buf
}
