# hows-ts

This is the TypeScript implementation of [HTTP-over-WebSocket](https://github.com/termermc/http-over-websocket) (HoWS).

It currently implements a browser-compatible client that exposes a
[fetch](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch)-compatible API that can be used anywhere `fetch`
is supported, including by patching `window.fetch`.

Get it:

```bash
npm install http-over-websocket
```

Use it:

```typescript
import { Hows } from 'http-over-websocket'

const hows = new Hows('ws://example.com/compat/hows')

const response = await hows.fetch('/api/info.json')
if (response.ok) {
	const json = await response.json()
} else {
	alert(`Got status: ${response.status} ${response.statusText}`)
}

```
