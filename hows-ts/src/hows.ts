import { BufferedReadableStreamController, newUnboundedBufferedReadableStream } from './stream.ts'
import { mkProm, randomBigInt, writeWs } from './util.ts'
import { decodeFrame, encodeFrame, FrameType, Header, HttpMethod } from './parse.ts'

type ReqState = {
	resBody: ReadableStream<Uint8Array<ArrayBuffer>>
	resBodyControl: BufferedReadableStreamController
	resProm: PromiseWithResolvers<Response>
}

const errWebSocketClosed = new Error('HoWS WebSocket closed')

/**
 * An implementation of W3C fetch multiplexed using a WebSocket connection.
 */
export class Hows {
	readonly #wsUrl: string
	readonly #wsUrlParsed: URL
	#ws: WebSocket
	#openProm = mkProm<void>()
	#openDelay = 0

	#reqs = new Map<bigint, ReqState>()

	/**
	 * Instantiates a new Hows object using the specified WebSocket URL.
	 * It will connect on its own and manage its own connection.
	 * @param wsUrl The WebSocket URL.
	 */
	constructor(wsUrl: string) {
		this.#wsUrl = wsUrl
		this.#wsUrlParsed = new URL(this.#wsUrl)
		this.#ws = this.#connect()
	}

	#onMessage(buf: ArrayBuffer): void {
		try {
			const frame = decodeFrame(new Uint8Array(buf))
			const req = this.#reqs.get(frame.requestId)
			if (req == null) {
				console.warn(`got frame type ${frame.type} for unknown request ID ${frame.requestId}`)
				return
			}

			switch (frame.type) {
				case FrameType.RESPONSE:
					const fr = frame.response
					const res = new Response(req.resBody, {
						status: fr.s,
						statusText: fr.m,
						headers: fr.h,
					})
					req.resProm.resolve(res)
					break
				case FrameType.BODY:
					req.resBodyControl.enqueue(frame.body)
					break
				case FrameType.END:
					this.#reqs.delete(frame.requestId)
					req.resBodyControl.close()
					break
				default:
					console.warn(`received irrelevant frame type ${frame.type} for request ID ${frame.requestId}`)
			}
		} catch (err) {
			console.error('failed to decode HoWS frame:', err)
		}
	}

	#connect(): WebSocket {
		const state = this.#ws?.readyState ?? WebSocket.CLOSED
		if (state !== WebSocket.CLOSED) {
			return this.#ws!
		}

		const ws = new WebSocket(this.#wsUrl, ['hows'])
		ws.binaryType = 'arraybuffer'
		this.#openProm.reject('opening new WebSocket connection')
		this.#openProm = mkProm<void>()
		ws.addEventListener('message', (event: MessageEvent) => {
			const data = event.data
			if (data instanceof ArrayBuffer) {
				this.#onMessage(data)
				return
			}

			console.warn(`expected array buffer from WebSocket, but got ${typeof data}`)
		})
		ws.addEventListener('open', this.#onOpen.bind(this))
		ws.addEventListener('close', this.#onClose.bind(this))
		ws.addEventListener('error', this.#onClose.bind(this))
		this.#ws = ws
		return ws
	}

	#onOpen(): void {
		this.#openDelay = 0
		this.#openProm.resolve()
	}
	#onClose(): void {
		this.#ws.close()
		this.#openProm.reject(errWebSocketClosed)
		this.#openProm = mkProm<void>()

		// Cancel pending requests.
		for (const req of this.#reqs.values()) {
			req.resProm.reject(errWebSocketClosed)
			req.resBodyControl.error(errWebSocketClosed)
		}

		// Try to reconnect.
		setTimeout(this.#connect.bind(this), this.#openDelay)
		if (this.#openDelay < 10_000) {
			this.#openDelay += 250
		}
	}

	/**
	 * Implementation of W3C fetch.
	 * @example
	 * ```js
	 * const fetch = session.fetch.bind(session)
	 * await fetch('/api/info')
	 * ```
	 * @param input
	 * @param requestInit
	 */
	async fetch(input: string | URL | Request, requestInit?: RequestInit): Promise<Response> {
		// Wait for WebSocket open.
		await this.#openProm.promise

		let url: URL
		let req: Request
		if (typeof input === 'string') {
			if (input.startsWith('/')) {
				url = new URL('http://' + this.#wsUrlParsed.host + input)
			} else {
				url = new URL(input)
			}
			req = new Request(input, requestInit)
		} else if (input instanceof URL) {
			url = input
			req = new Request(input, requestInit)
		} else {
			if (input.url.startsWith('/')) {
				url = new URL('http://' + this.#wsUrlParsed.host + input.url)
			} else {
				url = new URL(input.url)
			}
			req = new Request(input, requestInit)
		}

		if (url.host !== this.#wsUrlParsed.host) {
			throw new TypeError(`cannot use HoWS fetch with a URL whose host differs from the WebSocket host`)
		}

		// TODO Support abort, both when the abort signal is triggered and when a response body is prematurely closed.

		const headers: Header[] = []
		for (const [k, v] of req.headers) {
			headers.push([k, v])
		}

		const reqId = randomBigInt()

		// Write request.
		await writeWs(this.#ws, encodeFrame({
			type: FrameType.REQUEST,
			requestId: reqId,
			request: {
				m: req.method as HttpMethod,
				u: url.pathname + url.search,
				h: headers,
			}
		}))

		// Write body, if any.
		const body = req.body
		if (body != null) {
			const reader = body.getReader()
			while (true) {
				const buf = await reader.read()
				if (buf.value != null) {
					await writeWs(this.#ws, encodeFrame({
						type: FrameType.BODY,
						requestId: reqId,
						body: buf.value,
					}))
				}
				if (buf.done) {
					break
				}
			}
		}

		// Finish request.
		await writeWs(this.#ws, encodeFrame({
			type: FrameType.END,
			requestId: reqId,
			end: {
				t: [],
			},
		}))

		// Create pending request entry.
		const [resBody, resBodyControl] = newUnboundedBufferedReadableStream()
		const resProm = mkProm<Response>()
		this.#reqs.set(reqId, {
			resBody,
			resBodyControl,
			resProm,
		})

		return resProm.promise
	}
}
