# http-over-websocket (HoWS)
A protocol that has HTTP/2-ish semantics to multiplex HTTP over a single WebSocket connection.

It implements a framing protocol similar to HTTP/2's, where new requests sent with a random 64-bit ID, and their body
chunks and responses are associated using the same ID.

There is a [Go implementation](hows-go) and a [TypeScript implementation](hows-ts) (browser-compatible).

A demo is available [here](demo).

# Protocol
Each binary WebSocket message represents a frame with this layout:

`<type: 1 byte><request ID: 8 bytes><payload...>`

This means that the minimum message length is 9 bytes.

The payload differs depending on the frame type:

## `q`: Request
This is sent by the client to initiate a request. The request ID must be a new random int64.

The payload is JSON in this form:

```typescript
type Request = {
	/**
     * The request method.
     */
	m: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'CONNECT' | 'OPTIONS' | 'TRACE' | 'PATCH',

	/**
     * The request URI.
     */
	u: string

	/**
     * The request headers.
     */
	h: [string, string][]
}
```

## `a`: Response
A response is sent by the server after it has finished processing a request. It may come before the client has finished
sending the request's body. If the client receives a response for a request it hasn't finished writing the body of, it
should cancel sending the body.

The payload is JSON in this form:

```typescript
type Response = {
	/**
	 * The status code.
	 */
	s: number

	/**
	 * The status message.
	 */
	m: string

	/**
	 * The response headers.
	 */
	h: [string, string][]
}
```

## `b`: Body
A body chunk for a request or a response. The payload of this frame is the body chunk's raw bytes.

## `e`: End
This signals the successful end of a request or a response. It is sent after the request or response's body has been
fully sent, if any.

The payload is JSON in this form:

```typescript
type End = {
	/**
     * The response trailers.
     */
    t: [string, string][]
}
```

# Known Limitations
These are known limitations for the HoWS client and server.

## No `Transfer-Encoding` Support
The `Transfer-Encoding` header is not supported at all. Normally, `Transfer-Encoding: chunked` is used when flushing
content from an HTTP handler in HTTP/1.1. However, HTTP/2 does not supported chunked encoding, and HoWS lacks support
for the same reason. Furthermore, the Go implementation of HoWS sends all writes as their own frames anyway, so the
behavior of chunked encoding is preserved by default. Other `Transfer-Encoding` values such as `gzip` are not supported
because handling compression is out of the scope of the client implementation.

If a handler returns a `Transfer-Encoding` header, it will simply be ignored.

## No Client-Side Congestion Control
Due to awfully-designed [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) API provided by
browsers, we cannot use native TCP congestion control for the browser client. We *could* implement congestion control
in HoWS itself, but that woudl be out of scope of the protocol. This means that response bodies received from the server
are queued in an unbounded buffer, which could theoretically fill up the browser tab's memory if bodies are not being
read fast enough. In practice, this meanas that you should only use HoWS with trustworthy servers that won't be
deliberately abusing clients.

## No `FormData` Support
The `fetch`-compatible API does not support sending `FormData` bodies. This is because the browser cannot measure the
length of the `multipart/form-data` body without buffering encoding and buffering the `FormData` completely into memory.
In practice, this means that sending form files through HoWS is not supported unless they are each sent as a `Blob`
individually.

# Security Considerations
HoWS allows browsers to bypass the normal
[header restrictions](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header) imposed by `fetch`.
This means that if you depend on these restrictions for security (such as using `Sec-Fetch-Site` for CSRF protection),
then you should make sure that those endpoints are not exposed through HoWS.

HoWS gives the browser the kind of control over headers that curl does, so be sure to only expose endpoints where this
is acceptable, such as gRPC or ConnectRPC services.
