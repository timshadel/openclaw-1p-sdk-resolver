package protocol

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

const (
	// DefaultProtocolVersion is the OpenClaw exec provider protocol version.
	DefaultProtocolVersion = 1
	// DefaultMaxStdinBytes caps resolver-mode stdin.
	DefaultMaxStdinBytes = 1 << 20
)

// Request is the OpenClaw exec provider request.
type Request struct {
	ProtocolVersion int      `json:"protocolVersion"`
	Provider        string   `json:"provider,omitempty"`
	IDs             []string `json:"ids"`
}

// Response is the OpenClaw exec provider response.
type Response struct {
	ProtocolVersion int               `json:"protocolVersion"`
	Values          map[string]string `json:"values"`
}

// ReadRequest reads and validates a protocol request.
func ReadRequest(r io.Reader, maxBytes int64) (Request, error) {
	if maxBytes <= 0 {
		maxBytes = DefaultMaxStdinBytes
	}
	limited := io.LimitReader(r, maxBytes+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return Request{}, fmt.Errorf("read request: %w", err)
	}
	if int64(len(body)) > maxBytes {
		return Request{}, fmt.Errorf("request too large")
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var request Request
	if err := decoder.Decode(&request); err != nil {
		return Request{}, fmt.Errorf("decode request: %w", err)
	}
	if request.ProtocolVersion <= 0 {
		request.ProtocolVersion = DefaultProtocolVersion
	}
	if request.IDs == nil {
		request.IDs = []string{}
	}
	return request, nil
}

// EmptyResponse returns a valid response with no values.
func EmptyResponse(protocolVersion int) Response {
	if protocolVersion <= 0 {
		protocolVersion = DefaultProtocolVersion
	}
	return Response{ProtocolVersion: protocolVersion, Values: map[string]string{}}
}

// WriteResponse writes a protocol response as one JSON line.
func WriteResponse(w io.Writer, response Response) error {
	if response.Values == nil {
		response.Values = map[string]string{}
	}
	encoder := json.NewEncoder(w)
	return encoder.Encode(response)
}
