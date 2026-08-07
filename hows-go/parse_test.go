package hows

import (
	"math/rand/v2"
	"testing"
)

func TestEncodeThenDecode(t *testing.T) {
	f := Frame{
		Type:      FrameTypeRequest,
		RequestId: 11,
		Request: FrameRequest{
			Method: "GET",
			Uri:    "/api/test.json",
			Headers: [][]string{
				{"Content-Type", "text/plain"},
				{"X-Forwarded-For", "1.1.1.1"},
			},
		},
	}

	enc, err := EncodeFrame(f)
	if err != nil {
		t.Fatal(err)
	}

	dec, err := DecodeFrame(enc)
	if err != nil {
		t.Fatal(err)
	}

	if dec.Type != f.Type {
		t.Fatalf("wrong frame type: %c", dec.Type)
	}
	if dec.RequestId != f.RequestId {
		t.Fatalf("wrong request ID: %d", dec.RequestId)
	}
	req := f.Request
	decReq := dec.Request
	if decReq.Method != req.Method {
		t.Fatalf("wrong method: %s", decReq.Method)
	}
	if decReq.Uri != req.Uri {
		t.Fatalf("wrong URI: %s", decReq.Uri)
	}
	if len(decReq.Headers) != len(req.Headers) {
		t.Fatalf("wrong header count: %d", len(decReq.Headers))
	}
}

func BenchmarkEncodeThenDecode(b *testing.B) {
	for b.Loop() {
		enc, err := EncodeFrame(Frame{
			Type:      FrameTypeRequest,
			RequestId: rand.Int64(),
			Request: FrameRequest{
				Method: "POST",
				Uri:    "/api/service/TestThing",
				Headers: [][]string{
					{"Content-Type", "application/json"},
					{"Content-Length", "255"},
					{"User-Agent", "Firefox"},
				},
			},
		})
		if err != nil {
			b.Fatal(err)
		}

		_, _ = DecodeFrame(enc)
	}
}
