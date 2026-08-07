# HoWS Demo

This is a demo webapp that demonstrates using HoWS to multiplex long-lived HTTP requests.

Most browsers impose a per-origin HTTP/1.1 connection limit of 6. This demo multiplexes 26 requests over the same
WebSocket, bypassing HTTP/1.1 connection limits.

To run it, you need Node.js, pnpm and Go.

Run the server:

```bash
go run main.go
```

Run the client:

```bash
pnpm run dev
```

Now visit `http://localhost:5173` and see HoWS in action.
