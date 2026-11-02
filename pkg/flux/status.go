package flux

import (
	"context"
	"strings"
	"unicode/utf8"

	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
)

var allKinds = []string{"Kustomization", "HelmRelease", "GitRepository", "OCIRepository", "HelmRepository", "HelmChart", "Bucket", "Alert", "Provider", "Receiver", "ImageRepository", "ImagePolicy", "ImageUpdateAutomation"}

type finding struct {
	Kind                   string `json:"kind"`
	Namespace              string `json:"namespace"`
	Name                   string `json:"name"`
	Suspended              bool   `json:"suspended"`
	Ready                  *bool  `json:"ready"`
	Reason                 string `json:"reason"`
	Message                string `json:"message"`
	LastHandledReconcileAt string `json:"lastHandledReconcileAt"`
}
type kindCoverage struct {
	Kind    string              `json:"kind"`
	Pages   []resource.Coverage `json:"pages"`
	Stopped string              `json:"stopped,omitempty"`
}
type statusResult struct {
	Findings        []finding         `json:"findings"`
	Coverage        []kindCoverage    `json:"coverage"`
	CatalogCoverage resource.Coverage `json:"catalogCoverage"`
	Truncated       bool              `json:"truncated"`
	TruncatedKinds  []string          `json:"truncatedKinds"`
}

func clip(s string) string {
	if len(s) <= 1024 {
		return s
	}
	const marker = " [truncated]"
	s = s[:1024-len(marker)]
	for !utf8.ValidString(s) {
		s = s[:len(s)-1]
	}
	return s + marker
}

func findingFor(kind string, body map[string]any) (finding, bool) {
	meta, spec, status := objectMap(body["metadata"]), objectMap(body["spec"]), objectMap(body["status"])
	f := finding{Kind: kind, Namespace: stringField(meta, "namespace"), Name: stringField(meta, "name"), LastHandledReconcileAt: stringField(status, "lastHandledReconcileAt")}
	f.Suspended, _ = spec["suspend"].(bool)
	conditions, _ := status["conditions"].([]any)
	stalled := false
	var readyCondition map[string]any
	for _, item := range conditions {
		c := objectMap(item)
		if stringField(c, "type") == "Stalled" && stringField(c, "status") == "True" {
			stalled = true
			f.Reason, f.Message = clip(stringField(c, "reason")), clip(stringField(c, "message"))
		}
		if stringField(c, "type") == "Ready" {
			readyCondition = c
			switch stringField(c, "status") {
			case "True":
				b := true
				f.Ready = &b
			case "False":
				b := false
				f.Ready = &b
			}
			if !stalled {
				f.Reason, f.Message = clip(stringField(c, "reason")), clip(stringField(c, "message"))
			}
		}
	}
	static := staticObject(objectKey{Kind: kind}, body)
	if !static && !currentGeneration(meta, status, readyCondition) {
		f.Ready = nil
	}
	return f, f.Suspended || stalled || (f.Ready != nil && !*f.Ready) || (!static && f.Ready == nil)
}

func (a *access) status(ctx context.Context, namespace string, kinds []string) (statusResult, error) {
	result := statusResult{Findings: []finding{}, Coverage: []kindCoverage{}, CatalogCoverage: a.catalog.Coverage, TruncatedKinds: []string{}}
	defaultKinds := kinds == nil
	if defaultKinds {
		kinds = allKinds
	}
	examined := 0
	seenKinds := map[string]bool{}
	for _, kind := range kinds {
		lower := strings.ToLower(kind)
		if _, ok := groups[lower]; !ok {
			return result, unsupported()
		}
		if seenKinds[lower] {
			continue
		}
		seenKinds[lower] = true
		// Missing kinds in a default inventory are not installed; explicit requests fail.
		_, _, err := a.descriptor(kind)
		if err != nil {
			if defaultKinds && !a.hasKind(kind) {
				continue
			}
			return result, err
		}
		coverage := kindCoverage{Kind: kind, Pages: []resource.Coverage{}}
		if examined >= 2000 || len(result.Findings) >= 500 {
			coverage.Stopped = "overall limit"
			result.Truncated = true
			result.TruncatedKinds = append(result.TruncatedKinds, kind)
			result.Coverage = append(result.Coverage, coverage)
			continue
		}
		target, err := a.enumerationTarget(ctx, kind, namespace)
		if err != nil {
			return result, err
		}
		var cursor *string
		seen := map[string]bool{}
		for page := range 10 {
			response, err := a.client.Enumerate(ctx, owner, target.TargetID, resource.EnumerateRequest{Target: target.Target, PageSize: 100, Cursor: cursor})
			if err != nil {
				return result, err
			}
			coverage.Pages = append(coverage.Pages, response.Coverage)
			for _, record := range response.Records {
				if examined >= 2000 || len(result.Findings) >= 500 {
					coverage.Stopped = "overall limit"
					break
				}
				examined++
				body, err := nativeObject(record)
				if err != nil {
					return result, err
				}
				f, include := findingFor(kind, body)
				if include {
					result.Findings = append(result.Findings, f)
				}
			}
			if coverage.Stopped != "" || response.NextCursor == nil {
				break
			}
			next := *response.NextCursor
			if next == "" || seen[next] {
				return result, unsupported()
			}
			seen[next] = true
			if page == 9 {
				coverage.Stopped = "page limit"
				break
			}
			cursor = response.NextCursor
		}
		if coverage.Stopped != "" {
			result.Truncated = true
			result.TruncatedKinds = append(result.TruncatedKinds, kind)
		}
		result.Coverage = append(result.Coverage, coverage)
	}
	return result, nil
}
