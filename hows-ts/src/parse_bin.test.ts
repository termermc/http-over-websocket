import assert from 'node:assert/strict'
import test from 'node:test'
import { type Frame, FrameType } from './parse.ts'
import { randomBigInt } from './util.ts'
import { decodeFrameBin, encodeFrameBin } from './parse_bin.ts'

test('binary encode then decode result matches original frame', () => {
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
	const enc1 = encodeFrameBin(frame)
	const dec1 = decodeFrameBin(enc1)

	assert.deepStrictEqual(frame, dec1)
})

test('binary codec benchmark', () => {
	const start = performance.now()

	for (let i = 0; i < 1_000_000; i++) {
		const encoded = encodeFrameBin({
			type: FrameType.REQUEST,
			requestId: randomBigInt(),
			request: {
				m: 'POST',
				u: '/api/service/TestThing',
				h: [
					['Content-Type', 'application/json'],
					['Content-Length', '255'],
					['User-Agent', 'Firefox'],
				]
			}
		})
		decodeFrameBin(encoded)
	}

	const end = performance.now()

	console.log(`took ${(end-start)/1_000}s`)
})

test('binary decode benchmark', () => {
	const start = performance.now()

	const encoded = encodeFrameBin({
		type: FrameType.REQUEST,
		requestId: randomBigInt(),
		request: {
			m: 'POST',
			u: '/api/service/TestThing',
			h: [
				['Content-Type', 'application/json'],
				['Content-Length', '255'],
				['User-Agent', 'Firefox'],
			]
		}
	})

	for (let i = 0; i < 1_000_000; i++) {
		decodeFrameBin(encoded)
	}

	const end = performance.now()

	console.log(`took ${(end-start)/1_000}s`)
})

test('binary encode benchmark', () => {
	const start = performance.now()

	for (let i = 0; i < 1_000_000; i++) {
		encodeFrameBin({
			type: FrameType.REQUEST,
			requestId: randomBigInt(),
			request: {
				m: 'POST',
				u: '/api/service/TestThing',
				h: [
					['Content-Type', 'application/json'],
					['Content-Length', '255'],
					['User-Agent', 'Firefox'],
				]
			}
		})
	}

	const end = performance.now()

	console.log(`took ${(end-start)/1_000}s`)
})
