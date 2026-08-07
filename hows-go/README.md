# hows-go

This is the Go implementation of [HTTP-over-WebSocket](https://github.com/termermc/http-over-websocket) (HoWS).

It currently implements an `http.Handler` wrapper that can be mounted anywhere

Get it:

```bash
npm install hows
```

Use it:

```typescript
import { Hows } from 'hows'

const hows = new Hows('ws://example.com/compat/hows')

const response = await hows.fetch('/api/info.json')
if (response.ok) {
	const json = await response.json()
} else {
	alert(`Got status: ${response.status} ${response.statusText}`)
}

```
