package flux

import (
	"encoding/json"
	"fmt"
	"testing"
)

func TestSchemaNodeLocalReferences(t *testing.T) {
	doc := json.RawMessage(`{"definitions":{"object":{"properties":{"spec":{"$ref":"#/definitions/spec"}}},"spec":{"properties":{"suspend":{"type":"boolean"}}}},"root":{"$ref":"#/definitions/object"}}`)
	node, err := schemaNode(doc, "#/root", "spec", "suspend")
	if err != nil || node["type"] != "boolean" {
		t.Fatalf("node=%v err=%v", node, err)
	}
}

func TestSchemaNodeRejectsUnsafeReferences(t *testing.T) {
	for _, doc := range []string{
		`{"$ref":"https://example.com/schema"}`,
		`{"$ref":"#/definitions/a","definitions":{"a":{"$ref":"#/definitions/a"}}}`,
	} {
		if _, err := schemaNode(json.RawMessage(doc), ""); err == nil {
			t.Fatalf("accepted %s", doc)
		}
	}
}

func TestSchemaNodeReferenceHopLimit(t *testing.T) {
	for _, count := range []int{64, 65} {
		definitions := make(map[string]any)
		for i := range count - 1 {
			definitions[fmt.Sprint(i)] = map[string]any{"$ref": fmt.Sprintf("#/definitions/%d", i+1)}
		}
		definitions[fmt.Sprint(count-1)] = map[string]any{"type": "boolean"}
		document, err := json.Marshal(map[string]any{"definitions": definitions, "$ref": "#/definitions/0"})
		if err != nil {
			t.Fatal(err)
		}
		_, err = schemaNode(document, "")
		if (err == nil) != (count == 64) {
			t.Fatalf("%d hops: %v", count, err)
		}
	}
}
