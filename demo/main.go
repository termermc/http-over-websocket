package main

import (
	"github.com/coder/websocket"
	"github.com/termermc/http-over-websocket/hows-go"
	"net/http"
	"strconv"
	"time"
)

func main() {
	var helloRoute http.HandlerFunc = func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("hello world"))
	}
	var countRoute http.HandlerFunc = func(w http.ResponseWriter, r *http.Request) {
		flusher := w.(http.Flusher)

		w.WriteHeader(http.StatusOK)
		for i := range 10 {
			time.Sleep(1 * time.Second)
			_, _ = w.Write([]byte(strconv.Itoa(i)))
			flusher.Flush()
		}
	}

	mux := http.NewServeMux()
	mux.Handle("/", helloRoute)
	mux.Handle("/count", countRoute)

	compat := hows.NewHows(mux, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"},
	})
	mux.Handle("/compat/hows", compat)

	if err := http.ListenAndServe("0.0.0.0:5172", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		mux.ServeHTTP(w, r)
	})); err != nil {
		panic(err)
	}
}
