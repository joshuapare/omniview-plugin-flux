package flux

import "testing"

func TestSourceReferences(t *testing.T) {
	cases := []struct {
		key    objectKey
		object map[string]any
		want   objectKey
	}{
		{objectKey{"Kustomization", "app", "one"}, map[string]any{"spec": map[string]any{"sourceRef": map[string]any{"kind": "GitRepository", "name": "git", "namespace": "gitops"}}}, objectKey{"GitRepository", "gitops", "git"}},
		{objectKey{"HelmRelease", "app", "one"}, map[string]any{"spec": map[string]any{"chartRef": map[string]any{"name": "chart"}}}, objectKey{"HelmChart", "app", "chart"}},
		{objectKey{"HelmRelease", "app", "one"}, map[string]any{"spec": map[string]any{"chart": map[string]any{"spec": map[string]any{"sourceRef": map[string]any{"namespace": "sources"}}}}}, objectKey{"HelmChart", "sources", "app-one"}},
		{objectKey{"HelmChart", "sources", "chart"}, map[string]any{"spec": map[string]any{"sourceRef": map[string]any{"kind": "HelmRepository", "name": "repo", "namespace": "ignored"}}}, objectKey{"HelmRepository", "sources", "repo"}},
	}
	for _, tc := range cases {
		got, ok, err := sourceOf(tc.key, tc.object)
		if err != nil || !ok || got != tc.want {
			t.Fatalf("got %v, %v, %v; want %v", got, ok, err, tc.want)
		}
	}
}

func TestStaticOCIRepository(t *testing.T) {
	if !staticObject(objectKey{Kind: "HelmRepository"}, map[string]any{"spec": map[string]any{"type": "oci"}}) {
		t.Fatal("OCI repository must be static")
	}
	if staticObject(objectKey{Kind: "HelmRepository"}, map[string]any{"spec": map[string]any{"type": "default"}}) {
		t.Fatal("HTTP repository must reconcile")
	}
}
