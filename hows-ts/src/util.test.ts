import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBigInt } from './util.js'

test('randomBigInt works', async () => {
	const b1 = randomBigInt()
	const b2 = randomBigInt()
	assert(b1 !== b2)
})
