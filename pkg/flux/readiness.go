package flux

import (
	"context"
	"errors"
	"time"

	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/omniviewdev/plugin-sdk/pkg/v1/hostconnections"
)

func objectMap(value any) map[string]any { result, _ := value.(map[string]any); return result }
func stringField(value map[string]any, key string) string {
	result, _ := value[key].(string)
	return result
}

func currentGeneration(meta, status, ready map[string]any) bool {
	generation, ok := meta["generation"].(int64)
	if !ok {
		return false
	}
	observed := status["observedGeneration"]
	if observed == nil {
		observed = ready["observedGeneration"]
	}
	value, ok := observed.(int64)
	return ok && value == generation
}

// readyObservation fences all conditions by the requested reconcile timestamp
// and observed generation before interpreting either success or failure.
func readyObservation(object map[string]any, requested string) (bool, bool) {
	meta, status := objectMap(object["metadata"]), objectMap(object["status"])
	if meta["deletionTimestamp"] != nil {
		return false, true
	}
	if suspended, _ := objectMap(object["spec"])["suspend"].(bool); suspended {
		return false, true
	}
	if stringField(status, "lastHandledReconcileAt") != requested {
		return false, false
	}

	conditions, _ := status["conditions"].([]any)
	var ready, stalled map[string]any
	for _, item := range conditions {
		condition := objectMap(item)
		switch stringField(condition, "type") {
		case "Ready":
			ready = condition
		case "Stalled":
			stalled = condition
		}
	}
	if !currentGeneration(meta, status, ready) {
		return false, false
	}
	if stringField(stalled, "status") == "True" || stringField(ready, "status") == "False" {
		return false, true
	}
	return stringField(ready, "status") == "True", false
}

func (a *access) waitReady(ctx context.Context, target hostconnections.ResolvedTarget, typ resource.ResourceType, namespace, name, requested string) (resource.Record, error) {
	for {
		if err := ctx.Err(); err != nil {
			return resource.Record{}, err
		}
		record, err := a.get(ctx, target, typ, namespace, name)
		if err != nil {
			return resource.Record{}, err
		}
		body, err := resource.NativeFromValue(record.Body)
		if err != nil {
			return resource.Record{}, err
		}
		ready, terminal := readyObservation(objectMap(body), requested)
		if ready {
			return record, nil
		}
		if terminal {
			return resource.Record{}, errors.New("reconciliation did not become ready")
		}
		timer := time.NewTimer(time.Second)
		select {
		case <-ctx.Done():
			timer.Stop()
			return resource.Record{}, ctx.Err()
		case <-timer.C:
		}
	}
}
