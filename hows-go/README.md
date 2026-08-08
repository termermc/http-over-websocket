# hows-go

This is the Go implementation of [HTTP-over-WebSocket](https://github.com/termermc/http-over-websocket) (HoWS).

It currently implements an `http.Handler` wrapper that can be mounted anywhere

Get it:

```bash
go get github.com/termermc/http-over-websocket/hows-go
```

Use it:

```go
package main

import (
	"net/http"

	"github.com/termermc/http-over-websocket/hows-go"
)

func main() {
	var helloRoute http.HandlerFunc = func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("hello world"))
	}

	mux := http.NewServeMux()
	mux.Handle("/", helloRoute)

	compat := hows.NewHows(mux)
	mux.Handle("/compat/hows", compat)

	if err := http.ListenAndServe("0.0.0.0:5172", mux); err != nil {
		panic(err)
	}
}
```
