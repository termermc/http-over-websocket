# http-over-websocket (HoWS)
A protocol that has HTTP/2-ish semantics to multiplex HTTP over a single WebSocket connection.

# Security Considerations
HoWS allows browsers to bypass the normal
[header restrictions](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header) imposed by `fetch`.
This means that if you depend on these restrictions for security (such as using `Sec-Fetch-Site` for CSRF protection),
then you should make sure that those endpoints are not exposed through HoWS.

HoWS gives the browser the kind of control over headers that curl does, so be sure to only expose endpoints where this
is acceptable, such as gRPC or ConnectRPC services.
