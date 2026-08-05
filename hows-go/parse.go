package hows

// FrameType is a HoWS frame type.
type FrameType byte

const (
	// FrameTypeRequest is the frame type used for sending a new request.
	// It must be accompanied by a new request ID.
	FrameTypeRequest FrameType = 'q'

	// FrameTypeResponse is the frame type used for sending a response to a request.
	FrameTypeResponse FrameType = 'a'

	// FrameTypeBody is the frame type for sending body data (used for both requests and responses).
	FrameTypeBody FrameType = 'b'

	// FrameTypeEnd is the frame type that is sent at the end of a request or response.
	// It can optionally include trailers.
	FrameTypeEnd FrameType = 'e'
)

type Frame struct {
}

type FrameRequest struct {
	Uri     string     `json:"u"`
	Headers [][]string `json:"h"`
}

type FrameResponse struct {
	StatusCode    int        `json:"s"`
	StatusMessage string     `json:"m"`
	Headers       [][]string `json:"h"`
}

type FrameEnd struct {
	Trailers [][]string `json:"t"`
}
