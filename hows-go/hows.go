package hows

import (
	"context"
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
	if !resSent {
		return
	}

	r.unsafeWriteHeader(statusCode)
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
func NewHows(handler http.Handler, acceptOpts *websocket.AcceptOptions) *Hows {
	return &Hows{
		inner:      handler,
		acceptOpts: acceptOpts,

		states: make(map[int64]*reqState),
	}
}

var _ http.Handler = (*Hows)(nil)

var howsSubprotocols = []string{"hows"}

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
			rawStrs := strings.Split(trlStr, ",")
			for _, trl := range rawStrs {
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

		h.statesMu.Lock()
		delete(h.states, frame.RequestId)
		h.statesMu.Unlock()

		endFrame, _ := EncodeFrame(Frame{
			Type:      FrameTypeEnd,
			RequestId: state.id,
			End: FrameEnd{
				Trailers: httpHeaderToFrameHeaders(state.req.Trailer),
			},
		})
		_ = conn.Write(ctx, websocket.MessageBinary, endFrame)
		ctxCancel(context.Canceled)
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

	trailers := frameHeadersToHttpHeader(frame.End.Trailers)
	state.req.Trailer = trailers
	_ = state.reqBodyWriter.Close()
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
		default:
			// Unknown frame type.
			return
		}
	}
}
