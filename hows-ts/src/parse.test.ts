import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeFrame, encodeFrame, type Frame, FrameType } from './parse.js'
import { randomBigInt } from './util.js'

test('encode then decode result matches original frame', () => {
	const frame: Frame = {
		type: FrameType.REQUEST,
		requestId: 11n,
		request: {
			m: 'GET',
			u: '/api/test.json',
			h: [
				['Content-Type', 'text/plain'],
				['X-Forwarded-For', '1.1.1.1'],
			],
		},
	}
	const enc1 = encodeFrame(frame)
	const dec1 = decodeFrame(enc1)

	assert.deepStrictEqual(frame, dec1)
})

test('JSON codec benchmark', () => {
	const start = performance.now()

	for (let i = 0; i < 10_000; i++) {
		const encoded = encodeFrame({
			type: FrameType.REQUEST,
			requestId: randomBigInt(),
			request: {
				m: 'POST',
				u: '/api/service/TestThing',
				h: [
					['Content-Type', 'application/json'],
					['Content-Length', '255'],
					['User-Agent', 'Firefox'],
				],
			},
		})
		decodeFrame(encoded)
	}

	const end = performance.now()

	console.log(`took ${(end - start) / 1_000}s`)
})

test('JSON decode benchmark', () => {
	const start = performance.now()

	const encoded = encodeFrame({
		type: FrameType.REQUEST,
		requestId: randomBigInt(),
		request: {
			m: 'POST',
			u: '/api/service/TestThing',
			h: [
				['Content-Type', 'application/json'],
				['Content-Length', '255'],
				['User-Agent', 'Firefox'],
			],
		},
	})

	for (let i = 0; i < 10_000; i++) {
		decodeFrame(encoded)
	}

	const end = performance.now()

	console.log(`took ${(end - start) / 1_000}s`)
})

test('JSON encode benchmark', () => {
	const start = performance.now()

	for (let i = 0; i < 10_000; i++) {
		encodeFrame({
			type: FrameType.REQUEST,
			requestId: randomBigInt(),
			request: {
				m: 'POST',
				u: '/api/service/TestThing',
				h: [
					['Content-Type', 'application/json'],
					['Content-Length', '255'],
					['User-Agent', 'Firefox'],
				],
			},
		})
	}

	const end = performance.now()

	console.log(`took ${(end - start) / 1_000}s`)
})
