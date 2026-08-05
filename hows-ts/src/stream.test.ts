import assert from 'node:assert/strict'
import test from 'node:test'

import { newUnboundedBufferedReadableStream } from './stream.ts'

function bytes(value: string): Uint8Array<ArrayBuffer> {
	return new TextEncoder().encode(value)
}

function text(value: any): string {
	return new TextDecoder().decode(value)
}

test('reads enqueued chunks in order', async () => {
	const [stream, body] = newUnboundedBufferedReadableStream()

	body.enqueue(bytes('a'))
	body.enqueue(bytes('b'))
	body.enqueue(bytes('c'))
	body.close()

	const reader = stream.getReader()
	const out: string[] = []

	while (true) {
		const result = await reader.read()
		if (result.done) {
			break
		}
		out.push(text(result.value))
	}

	assert.deepEqual(out, ['a', 'b', 'c'])
	assert.equal(body.state, 'closed')
})

test('read waits until chunk is enqueued', async () => {
	const [stream, body] = newUnboundedBufferedReadableStream()
	const reader = stream.getReader()

	let settled = false
	const pendingRead = reader.read().then((result) => {
		settled = true
		return result
	})

	await new Promise((resolve) => setTimeout(resolve, 10))
	assert.equal(settled, false)

	body.enqueue(bytes('hello'))

	const result = await pendingRead
	assert.equal(result.done, false)
	assert.equal(text(result.value), 'hello')

	body.close()

	const eof = await reader.read()
	assert.equal(eof.done, true)
})

test('close ends stream after queued chunks', async () => {
	const [stream, body] = newUnboundedBufferedReadableStream()

	body.enqueue(bytes('x'))
	body.close()

	const reader = stream.getReader()

	const first = await reader.read()
	assert.equal(first.done, false)
	assert.equal(text(first.value), 'x')

	const second = await reader.read()
	assert.equal(second.done, true)
})

test('enqueue after close throws', () => {
	const [, body] = newUnboundedBufferedReadableStream()

	body.close()

	assert.throws(() => {
		body.enqueue(bytes('x'))
	}, /closed/)
})

test('error causes reads to reject', async () => {
	const [stream, body] = newUnboundedBufferedReadableStream()
	const reader = stream.getReader()

	body.error(new Error('boom'))

	await assert.rejects(async () => {
		await reader.read()
	}, /boom/)

	assert.equal(body.state, 'errored')
})

test('enqueue after error throws', () => {
	const [, body] = newUnboundedBufferedReadableStream()

	body.error(new Error('boom'))

	assert.throws(() => {
		body.enqueue(bytes('x'))
	}, /errored/)
})

test('consumer cancellation updates state and calls onCancel', async () => {
	let cancelReason: unknown

	const [stream, body] = newUnboundedBufferedReadableStream({
		onCancel(reason) {
			cancelReason = reason
		},
	})

	await stream.cancel('no longer needed')

	assert.equal(body.state, 'canceled')
	assert.equal(cancelReason, 'no longer needed')
})

test('enqueue after consumer cancellation throws', async () => {
	const [stream, body] = newUnboundedBufferedReadableStream()

	await stream.cancel('done')

	assert.throws(() => {
		body.enqueue(bytes('x'))
	}, /canceled/)
})
