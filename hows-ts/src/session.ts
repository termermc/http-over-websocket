import { BufferedReadableStreamController } from './stream.ts'

class ReqState {
	resBody: ReadableStream<Uint8Array<ArrayBuffer>>
	resBodyControl: BufferedReadableStreamController
	resProm: PromiseWithResolvers<Response>
}

export class HowsSession {
	#wsUrl: string
	#ws: WebSocket | undefined

	#reqs = new Map<BigInt, ReqState>()

	constructor(wsUrl: string) {
		this.#wsUrl = wsUrl
	}

	#onClose() {}
}
