import './style.css'
import { Hows } from 'hows'

const host = window.location.hostname + ':5172'
const hows = new Hows(`ws://${host}/compat/hows`)

window.fetch = hows.fetch.bind(hows)

const consoleElem = document.createElement('textarea')
consoleElem.readOnly = true
consoleElem.style.position = 'fixed'
consoleElem.style.top = '0'
consoleElem.style.left = '0'
consoleElem.style.width = '100vw'
consoleElem.style.height = '100vh'
document.body.appendChild(consoleElem)

function println(str: string) {
	consoleElem.textContent += str + '\n'
}

const utf8Decoder = new TextDecoder('utf-8')

println('starting')
const countRes = await fetch('/count')
const reader = countRes.body!.getReader()
while (true) {
	const { done, value } = await reader.read()
	if (value) {
		println(utf8Decoder.decode(value))
	}
	if (done) {
		break
	}
}
println('done')
