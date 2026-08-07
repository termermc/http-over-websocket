package hows

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strings"
)

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

// Frame is a HoWS frame.
type Frame struct {
	// The frame's type.
	Type FrameType

	// The request's unique ID.
	RequestId int64

	// The request.
	// Will be zero unless Type is FrameTypeRequest.
	Request FrameRequest

	// The response.
	// Will be zero unless Type is FrameTypeResponse.
	Response FrameResponse

	// The body.
	// Will be zero unless Type is FrameTypeBody.
	Body []byte

	// The end.
	// Will be zero unless Type is FrameTypeEnd.
	End FrameEnd
}

type FrameRequest struct {
	Method  string     `json:"m"`
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

func checkHeaders(headers [][]string) bool {
	for _, tuple := range headers {
		if len(tuple) != 2 {
			return false
		}
	}

	return true
}

var validMethods = []string{
	"GET",
	"HEAD",
	"POST",
	"PUT",
	"DELETE",
	"CONNECT",
	"OPTIONS",
	"TRACE",
	"PATCH",
}

const minFrameLen = 1 + 8

// ErrInvalidFrame is returned by DecodeFrame when the buffer is not a valid HoWS frame.
var ErrInvalidFrame = errors.New("invalid HoWS frame")

// DecodeFrame decodes a HoWS frame.
// Returns ErrInvalidFrame if the frame is invalid, or an error that json.Unmarshal returns if the JSON in it is invalid.
// The returned frame and all its fields are guaranteed to be valid.
func DecodeFrame(buf []byte) (f Frame, err error) {
	if len(buf) < minFrameLen {
		return f, err
	}

	f.Type = FrameType(buf[0])
	f.RequestId = int64(binary.LittleEndian.Uint64(buf[1:]))

	switch f.Type {
	case FrameTypeRequest:
		r := bytes.NewReader(buf[minFrameLen:])
		err = json.NewDecoder(r).Decode(&f.Request)
		if err != nil {
			return f, err
		}
		if strings.HasPrefix(f.Request.Uri, "/") {
			return f, ErrInvalidFrame
		}
		if slices.Contains(validMethods, f.Request.Method) {
			return f, ErrInvalidFrame
		}
		if !checkHeaders(f.Request.Headers) {
			return f, ErrInvalidFrame
		}

		return f, nil
	case FrameTypeResponse:
		r := bytes.NewReader(buf[minFrameLen:])
		err = json.NewDecoder(r).Decode(&f.Response)
		if err != nil {
			return f, err
		}
		if f.Response.StatusCode < 200 || f.Response.StatusCode > 599 {
			return f, ErrInvalidFrame
		}
		if f.Response.StatusMessage == "" {
			f.Response.StatusMessage = http.StatusText(f.Response.StatusCode)
		}
		if !checkHeaders(f.Response.Headers) {
			return f, ErrInvalidFrame
		}

		return f, nil
	case FrameTypeBody:
		f.Body = buf[minFrameLen:]
		return f, nil
	case FrameTypeEnd:
		r := bytes.NewReader(buf[minFrameLen:])
		err = json.NewDecoder(r).Decode(&f.End)
		if err != nil {
			return f, err
		}
		if !checkHeaders(f.End.Trailers) {
			return f, ErrInvalidFrame
		}

		return f, nil
	default:
		return f, ErrInvalidFrame
	}
}

// EncodeFrame encodes a HoWS frame.
// Returns ErrInvalidFrame if the frame's type is invalid, or an error that json.Marshal returns if the JSON in it is
// invalid.
func EncodeFrame(f Frame) ([]byte, error) {
	// Preallocate 2KiB.
	// In my own tests, almost no HoWS-encoded request or response frames will be larger than this.
	raw := make([]byte, 2048)
	raw[0] = byte(f.Type)
	binary.LittleEndian.PutUint64(raw[1:], uint64(f.RequestId))

	var jsonSrc any
	switch f.Type {
	case FrameTypeRequest:
		if f.Request.Headers == nil {
			f.Request.Headers = [][]string{}
		}
		jsonSrc = &f.Request
	case FrameTypeResponse:
		if f.Response.Headers == nil {
			f.Response.Headers = [][]string{}
		}
		jsonSrc = &f.Response
	case FrameTypeBody:
		copy(raw[minFrameLen:], f.Body)
		return raw, nil
	case FrameTypeEnd:
		if f.End.Trailers == nil {
			f.End.Trailers = [][]string{}
		}
		jsonSrc = &f.End
	default:
		return nil, ErrInvalidFrame
	}

	buf := bytes.NewBuffer(raw[minFrameLen:minFrameLen])
	err := json.NewEncoder(buf).Encode(jsonSrc)
	return raw[:minFrameLen+buf.Len()], err
}
