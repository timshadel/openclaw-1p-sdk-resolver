package protocol

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestReadRequestAndWriteResponse(t *testing.T) {
	t.Parallel()
	request, err := ReadRequest(bytes.NewBufferString(`{"protocolVersion":1,"provider":"openclaw-1p-sdk-resolver","ids":["a"]}`), 1024)
	if err != nil {
		t.Fatalf("ReadRequest: %v", err)
	}
	if request.ProtocolVersion != 1 || request.Provider != "openclaw-1p-sdk-resolver" || len(request.IDs) != 1 || request.IDs[0] != "a" {
		t.Fatalf("unexpected request: %#v", request)
	}
	var out bytes.Buffer
	if err := WriteResponse(&out, Response{ProtocolVersion: 1, Values: map[string]string{"a": "b"}}); err != nil {
		t.Fatalf("WriteResponse: %v", err)
	}
	var response Response
	if err := json.Unmarshal(out.Bytes(), &response); err != nil {
		t.Fatalf("response JSON: %v", err)
	}
	if response.Values["a"] != "b" {
		t.Fatalf("unexpected response: %#v", response)
	}
}

func TestReadRequestRejectsInvalidInput(t *testing.T) {
	t.Parallel()
	if _, err := ReadRequest(bytes.NewBufferString(`{"protocolVersion":1,"ids":[],"extra":true}`), 1024); err == nil {
		t.Fatal("expected unknown field error")
	}
	if _, err := ReadRequest(bytes.NewBufferString(`{"protocolVersion":1,"ids":[]}`), 4); err == nil {
		t.Fatal("expected size error")
	}
}
