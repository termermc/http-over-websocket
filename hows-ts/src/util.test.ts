import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBigInt, tryResolveBody, utf8ByteLen } from './util.js'

test('randomBigInt works', async () => {
	const b1 = randomBigInt()
	const b2 = randomBigInt()
	assert(b1 !== b2)
})

test(`utf8ByteLen doesn't allocate unless it's necessary`, () => {
	const len = utf8ByteLen("hello 中國")

	assert.strictEqual(len, 12)
})

test('tryResolveBody works', () => {
	const strBody = 'hello 中國'
	assert.strictEqual(tryResolveBody(strBody)?.len, 12)

	const emptyBlobBody = new Blob()
	const emptyBlobRes = tryResolveBody(emptyBlobBody)
	assert.strictEqual(emptyBlobRes?.len, 0)
	assert.strictEqual(emptyBlobRes?.type, undefined)

	const blobBody = new Blob(['hello 中國', 'hi'], { type: 'text/plain' })
	const blobRes = tryResolveBody(blobBody)
	assert.strictEqual(blobRes?.len, 14)
	assert.strictEqual(blobRes?.type, 'text/plain')

	const uint8Body = new Uint8Array([1, 2, 3])
	const uint8Res = tryResolveBody(uint8Body)
	assert.strictEqual(uint8Res?.len, 3)
	assert.strictEqual(uint8Res?.type, undefined)

	const subArrBody = uint8Body.subarray(1)
	const subArrRes = tryResolveBody(subArrBody)
	assert.strictEqual(subArrRes?.len, 2)
	assert.strictEqual(subArrRes?.type, undefined)

	const viewBody = new DataView(uint8Body.buffer, 2)
	const viewRes = tryResolveBody(viewBody)
	assert.strictEqual(viewRes?.len, 1)
	assert.strictEqual(viewRes?.type, undefined)

	const searchBody = new URLSearchParams([
		['key1', 'value1'],
		['key2', 'value2'],
		['message', 'hello 中國'],
	])
	const searchRes = tryResolveBody(searchBody)
	assert.strictEqual(searchRes?.len, 56)
	assert.strictEqual(searchRes?.type, 'application/x-www-form-urlencoded')

	const formDataBody = new FormData()
	const formDataRes = tryResolveBody(formDataBody)
	assert.strictEqual(formDataRes, null)

	const jsonBody = {message: 'hello 中國'}
	const jsonRes = tryResolveBody(jsonBody)
	assert.strictEqual(jsonRes?.len, 26)
	assert.strictEqual(jsonRes?.type, 'application/json')

	const jsonArrBody = ['hello 中國', 'hi']
	const jsonArrRes = tryResolveBody(jsonArrBody)
	assert.strictEqual(jsonArrRes?.len, 21)
	assert.strictEqual(jsonArrRes?.type, 'application/json')
})
