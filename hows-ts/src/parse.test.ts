import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeFrame, encodeFrame, type Frame } from './parse.ts'

test('encode then decode result matches original frame', () => {
	const frame: Frame = {
		type: 'q',
		requestId: 11n,
		request: {
			m: 'GET',
			u: '/api/test.json',
			h: [['Content-Type', 'text/plain']],
		},
	}
	const enc1 = encodeFrame(frame)
	const dec1 = decodeFrame(enc1)

	assert.deepStrictEqual(frame, dec1)
})
