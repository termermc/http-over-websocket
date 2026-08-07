import './style.css'
import { Hows } from 'hows'

const host = window.location.hostname + ':5172'
const hows = new Hows(`ws://${host}/compat/hows`)

window.fetch = hows.fetch.bind(hows)
