package hows

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"github.com/coder/websocket"
)

func isForbiddenKey(canonicalKey string) bool {
	return canonicalKey == "Host" ||
		canonicalKey == "Origin" ||
		canonicalKey == "Connection" ||
		canonicalKey == "Keep-Alive"
}

func frameHeadersToHttpHeader(headers [][]string) http.Header {
	res := make(http.Header, len(headers))
	for _, tuple := range headers {
		key := http.CanonicalHeaderKey(tuple[0])
		val := tuple[1]
		if isForbiddenKey(key) {
			continue
		}

		vals, _ := res[key]
		vals = append(vals, val)
		res[key] = vals
	}
	return res
}
func httpHeaderToFrameHeaders(header http.Header) [][]string {
	res := make([][]string, 0, len(header))
	for key, vals := range header {
		for _, val := range vals {
			res = append(res, []string{key, val})
		}
	}
	return res
}

type reqState struct {
	id        int64
	ctx       context.Context
	ctxCancel context.CancelCauseFunc
	wsConn    *websocket.Conn

	req           *http.Request
	reqBodyReader io.ReadCloser
	reqBodyWriter io.WriteCloser

	resMu      sync.Mutex
	resHeaders http.Header
	resSent    bool
}

var _ http.ResponseWriter = (*reqState)(nil)
var _ http.Flusher = (*reqState)(nil)

func (r *reqState) Header() http.Header {
	return r.resHeaders
}

func (r *reqState) Write(bytes []byte) (int, error) {
	r.resMu.Lock()
	resSent := r.resSent
	r.resMu.Unlock()
	if !resSent {
		r.unsafeWriteHeader(http.StatusOK)
	}

	// Write body chunk.
	frame, _ := EncodeFrame(Frame{
		Type:      FrameTypeBody,
		RequestId: r.id,
		Body:      bytes,
	})
	err := r.wsConn.Write(r.ctx, websocket.MessageBinary, frame)
	if err != nil {
		return 0, err
	}
	return len(bytes), nil
}

func (r *reqState) unsafeWriteHeader(statusCode int) {
	frame, _ := EncodeFrame(Frame{
		Type:      FrameTypeResponse,
		RequestId: r.id,
		Response: FrameResponse{
			StatusCode:    statusCode,
			StatusMessage: http.StatusText(statusCode),
			Headers:       httpHeaderToFrameHeaders(r.resHeaders),
		},
	})
	_ = r.wsConn.Write(r.ctx, websocket.MessageBinary, frame)

	r.resMu.Lock()
	r.resSent = true
	r.resMu.Unlock()
}

func (r *reqState) WriteHeader(statusCode int) {
	r.resMu.Lock()
	resSent := r.resSent
	r.resMu.Unlock()
	if resSent {
		return
	}

	r.unsafeWriteHeader(statusCode)
}

func (r *reqState) Flush() {
	// Flush is a no-op because writes aren't buffered.
}

// Hows is an adapter that can multiplex HTTP requests over a single WebSocket connection.
// It sends requests to an HTTP handler.
type Hows struct {
	inner      http.Handler
	acceptOpts *websocket.AcceptOptions

	states   map[int64]*reqState
	statesMu sync.Mutex
}

// NewHows creates a new HoWS adapter that sends requests to the provided handler.
func NewHows(handler http.Handler) *Hows {
	return NewHowsWithOptions(handler, nil)
}

// NewHowsWithOptions is like NewHows, but allows you to customize the WebSocket accept options.
func NewHowsWithOptions(handler http.Handler, acceptOpts *websocket.AcceptOptions) *Hows {
	return &Hows{
		inner:      handler,
		acceptOpts: acceptOpts,

		states: make(map[int64]*reqState),
	}
}

var _ http.Handler = (*Hows)(nil)

const howsSubprotocol = "hows"

var howsSubprotocols = []string{howsSubprotocol}
var howsSubprotocolWrong = []byte(fmt.Sprintf(`only the %q subprotocol is allowed`, howsSubprotocol))

func (h *Hows) handleReq(
	ctx context.Context,
	frame Frame,
	wsReq *http.Request,
	conn *websocket.Conn,
) {
	var err error

	h.statesMu.Lock()
	_, has := h.states[frame.RequestId]
	h.statesMu.Unlock()
	if has {
		// Client is broken and sending multiple requests with the same ID.
		return
	}

	fr := frame.Request

	// Construct request.
	var reqReader io.ReadCloser
	pipeReader, reqWriter := io.Pipe()
	reqReader = pipeReader
	reqHeaders := frameHeadersToHttpHeader(fr.Headers)
	var contentLen int64 = -1
	if lenStr := reqHeaders.Get("Content-Length"); lenStr != "" {
		contentLen, err = strconv.ParseInt(lenStr, 10, 64)
		if err != nil {
			// Don't accept requests with a malformed Content-Length header.
			return
		}

		if contentLen >= 0 {
			// Wrap reader in a limiter based on the content length.
			// This ad-hoc struct here is to make it satisfy io.ReadCloser.
			reqReader = struct {
				io.Reader
				io.Closer
			}{
				io.LimitReader(reqReader, contentLen),
				pipeReader,
			}
		} else if contentLen < -1 {
			contentLen = -1
		}
	}
	trailers := make(http.Header)
	if contentLen < 1 {
		if trlStr := reqHeaders.Get("Trailer"); trlStr != "" {
			rawStrs := strings.SplitSeq(trlStr, ",")
			for trl := range rawStrs {
				trailers[strings.TrimSpace(trl)] = nil
			}
		}
	}
	req, err := http.NewRequestWithContext(
		ctx,
		fr.Method,
		wsReq.URL.Scheme+wsReq.URL.Host+fr.Uri,
		reqReader,
	)
	if err != nil {
		panic("BUG: created invalid request: " + err.Error())
	}
	req.Proto = "HTTP/1.1"
	req.ProtoMajor = 1
	req.ProtoMinor = 1
	req.Header = reqHeaders
	req.ContentLength = contentLen
	req.Trailer = trailers
	req.RemoteAddr = wsReq.RemoteAddr
	req.RequestURI = fr.Uri

	// Create request state.
	reqCtx, ctxCancel := context.WithCancelCause(ctx)
	state := &reqState{
		id:        frame.RequestId,
		ctx:       reqCtx,
		ctxCancel: ctxCancel,
		wsConn:    conn,

		req:           req,
		reqBodyReader: reqReader,
		reqBodyWriter: reqWriter,

		resHeaders: make(http.Header),
	}
	h.statesMu.Lock()
	h.states[frame.RequestId] = state
	h.statesMu.Unlock()

	go func() {
		// Run request handler and finish response when it returns.
		h.inner.ServeHTTP(state, req)

		_ = state.reqBodyReader.Close()
		_ = state.reqBodyWriter.Close()

		// If we haven't sent headers yet, do that now.
		state.WriteHeader(http.StatusNoContent)

		endFrame, _ := EncodeFrame(Frame{
			Type:      FrameTypeEnd,
			RequestId: state.id,
			End: FrameEnd{
				Trailers: httpHeaderToFrameHeaders(state.req.Trailer),
			},
		})
		_ = conn.Write(ctx, websocket.MessageBinary, endFrame)

		ctxCancel(context.Canceled)

		h.statesMu.Lock()
		delete(h.states, frame.RequestId)
		h.statesMu.Unlock()
	}()
}

func (h *Hows) handleBody(frame Frame) {
	h.statesMu.Lock()
	state, has := h.states[frame.RequestId]
	h.statesMu.Unlock()
	if !has {
		return
	}

	var wrote int
	for wrote < len(frame.Body) {
		n, err := state.reqBodyWriter.Write(frame.Body[wrote:])
		if err != nil {
			if errors.Is(err, io.ErrClosedPipe) {
				// Handler returned before reading full body.
				// We can just ignore it.
				return
			}

			return
		}
		wrote += n
	}
}

func (h *Hows) handleEnd(frame Frame) {
	h.statesMu.Lock()
	state, has := h.states[frame.RequestId]
	h.statesMu.Unlock()
	if !has {
		return
	}

	// I believe it's correct to mutate the request's trailers here because request handlers shouldn't be concurrently
	// reading a body and also reading trailers at the same time. I doubt there are any actual request handlers written
	// in the wild that would violate this. I would lock if I could, but there's no lock to use on http.Request.
	trailers := frameHeadersToHttpHeader(frame.End.Trailers)
	state.req.Trailer = trailers

	_ = state.reqBodyWriter.Close()
}

func (h *Hows) handleCancel(frame Frame) {
	h.statesMu.Lock()
	state, has := h.states[frame.RequestId]
	if has {
		delete(h.states, frame.RequestId)
	} else {
		h.statesMu.Unlock()
		return
	}
	h.statesMu.Unlock()

	_ = state.reqBodyWriter.Close()
	state.ctxCancel(context.Canceled)
}

func (h *Hows) ServeHTTP(wsWriter http.ResponseWriter, wsReq *http.Request) {
	acceptOpts := h.acceptOpts
	if acceptOpts == nil {
		acceptOpts = &websocket.AcceptOptions{}
	}
	acceptOpts.Subprotocols = howsSubprotocols

	conn, err := websocket.Accept(wsWriter, wsReq, acceptOpts)
	if err != nil {
		wsWriter.WriteHeader(500)
		_, _ = wsWriter.Write([]byte(err.Error()))
		return
	}
	if conn.Subprotocol() != howsSubprotocols[0] {
		wsWriter.WriteHeader(400)
		_, _ = wsWriter.Write(howsSubprotocolWrong)
		return
	}

	ctx := wsReq.Context()

	for {
		msgType, msg, err := conn.Read(ctx)
		if err != nil {
			return
		}
		if msgType != websocket.MessageBinary {
			return
		}

		frame, err := DecodeFrame(msg)
		if err != nil {
			return
		}

		switch frame.Type {
		case FrameTypeRequest:
			h.handleReq(ctx, frame, wsReq, conn)
		case FrameTypeBody:
			h.handleBody(frame)
		case FrameTypeEnd:
			h.handleEnd(frame)
		case FrameTypeCancel:
			h.handleCancel(frame)
		default:
			// Unknown frame type.
			return
		}
	}
}
