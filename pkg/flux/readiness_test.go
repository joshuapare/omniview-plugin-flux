package flux

import (
	"context"
	"errors"
	"testing"
	"time"

	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/omniviewdev/plugin-sdk/pkg/v1/hostconnections"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestReadinessRequiresCurrentTimestampAndGeneration(t *testing.T) {
	object := map[string]any{
		"metadata": map[string]any{"generation": int64(2)},
		"status":   map[string]any{"lastHandledReconcileAt": "old", "observedGeneration": int64(1), "conditions": []any{map[string]any{"type": "Ready", "status": "False"}, map[string]any{"type": "Stalled", "status": "True"}}},
	}
	if ready, terminal := readyObservation(object, "new"); ready || terminal {
		t.Fatal("stale failure terminated wait")
	}
	status := objectMap(object["status"])
	status["lastHandledReconcileAt"] = "new"
	if ready, terminal := readyObservation(object, "new"); ready || terminal {
		t.Fatal("stale generation terminated wait")
	}
	status["observedGeneration"] = int64(2)
	if ready, terminal := readyObservation(object, "new"); ready || !terminal {
		t.Fatal("current failure was not terminal")
	}
	status["conditions"] = []any{map[string]any{"type": "Ready", "status": "True"}}
	if ready, terminal := readyObservation(object, "new"); !ready || terminal {
		t.Fatal("current readiness not accepted")
	}
}

func TestWaitStopsOnCancellationBeforeDispatch(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	client := &updateFixture{}
	a := access{client: client}
	_, err := a.waitReady(ctx, hostconnections.ResolvedTarget{}, resource.ResourceType{}, "ns", "name", "now")
	if !errors.Is(err, context.Canceled) || client.reads != 0 {
		t.Fatalf("reads=%d err=%v", client.reads, err)
	}
}

func TestReadinessUsesReadyConditionGeneration(t *testing.T) {
	object := map[string]any{"metadata": map[string]any{"generation": int64(3)}, "status": map[string]any{"lastHandledReconcileAt": "now", "conditions": []any{map[string]any{"type": "Ready", "status": "True", "observedGeneration": int64(3)}}}}
	ready, terminal := readyObservation(object, "now")
	if !ready || terminal {
		t.Fatalf("ready=%v terminal=%v", ready, terminal)
	}
	f, include := findingFor("GitRepository", object)
	if include || f.Ready == nil || !*f.Ready {
		t.Fatalf("condition fallback lost: %+v", f)
	}
}

func TestWaitDeadlineAndGRPCTimeoutClassification(t *testing.T) {
	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()
	f := &updateFixture{}
	a := access{client: f}
	_, err := a.waitReady(ctx, hostconnections.ResolvedTarget{}, resource.ResourceType{}, "ns", "name", "now")
	if !errors.Is(err, context.DeadlineExceeded) || f.reads != 0 {
		t.Fatalf("reads=%d err=%v", f.reads, err)
	}
	for _, cause := range []error{err, status.Error(codes.DeadlineExceeded, "private")} {
		mapped := mapTimeout(cause)
		if resource.ErrorCode(mapped) != "TIMEOUT" || !errors.Is(mapped, cause) {
			t.Fatalf("timeout=%v cause=%v", mapped, cause)
		}
	}
}
