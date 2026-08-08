import { Hows } from 'http-over-websocket'

const consoleElem = document.getElementById('console') as HTMLPreElement

function println(str: string) {
	consoleElem.textContent += str + '\n'
	requestAnimationFrame(() => {
		document.documentElement.scrollTo({
			top: document.body.scrollHeight,
		})
	})
}

const host = location.hostname + ':5172'
const hostRoot = location.protocol + '//' + host
const hows = new Hows(`ws://${host}/compat/hows`)

window.fetch = hows.fetch.bind(hows)

const utf8Decoder = new TextDecoder('utf-8')

async function count(label: string) {
	println(label + ': starting')
	const countRes = await fetch(hostRoot + '/count')
	const reader = countRes.body!.getReader()
	while (true) {
		const { done, value } = await reader.read()
		if (value) {
			println(label + ': ' + utf8Decoder.decode(value))
		}
		if (done) {
			break
		}
	}
	println(label + ': done')
}

const proms = new Array<Promise<void>>(26)
for (let i = 0; i < 26; i++) {
	proms[i] = count(String.fromCharCode(97 + i))
}

await Promise.all(proms)
println("=== all done ===")
