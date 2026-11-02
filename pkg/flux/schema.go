package flux

import (
	"encoding/json"
	"errors"
	"net/url"
	"strings"
)

// schemaNode follows only local JSON pointers. The hop limit applies across the
// whole field traversal, including references in the schema root.
func schemaNode(document json.RawMessage, root string, fields ...string) (map[string]any, error) {
	var doc any
	if err := json.Unmarshal(document, &doc); err != nil {
		return nil, err
	}
	current := doc
	hops := 0
	resolve := func(ref string) (any, error) {
		if !strings.HasPrefix(ref, "#") {
			return nil, errors.New("external schema reference")
		}
		pointer, err := url.PathUnescape(strings.TrimPrefix(ref, "#"))
		if err != nil {
			return nil, err
		}
		if pointer == "" {
			return doc, nil
		}
		if !strings.HasPrefix(pointer, "/") {
			return nil, errors.New("invalid schema pointer")
		}
		var node any = doc
		for _, part := range strings.Split(pointer[1:], "/") {
			part = strings.ReplaceAll(strings.ReplaceAll(part, "~1", "/"), "~0", "~")
			object, ok := node.(map[string]any)
			if !ok {
				return nil, errors.New("invalid schema pointer")
			}
			node, ok = object[part]
			if !ok {
				return nil, errors.New("missing schema pointer")
			}
		}
		return node, nil
	}
	follow := func(node any) (any, error) {
		seen := make(map[string]bool)
		for {
			m, ok := node.(map[string]any)
			if !ok {
				return nil, errors.New("invalid schema node")
			}
			ref, ok := m["$ref"].(string)
			if !ok {
				return node, nil
			}
			hops++
			if hops > 64 || seen[ref] {
				return nil, errors.New("cyclic schema reference")
			}
			seen[ref] = true
			var err error
			node, err = resolve(ref)
			if err != nil {
				return nil, err
			}
		}
	}
	if root != "" {
		var err error
		current, err = resolve(root)
		if err != nil {
			return nil, err
		}
	}
	for _, field := range fields {
		var err error
		current, err = follow(current)
		if err != nil {
			return nil, err
		}
		properties, ok := current.(map[string]any)["properties"].(map[string]any)
		if !ok {
			return nil, errors.New("missing schema properties")
		}
		current, ok = properties[field]
		if !ok {
			return nil, errors.New("missing schema field")
		}
	}
	current, err := follow(current)
	if err != nil {
		return nil, err
	}
	return current.(map[string]any), nil
}
