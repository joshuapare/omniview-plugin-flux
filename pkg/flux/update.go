package flux

import (
	"context"

	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/omniviewdev/plugin-sdk/pkg/v1/hostconnections"
)

// update retries only conflicts and applies the same logical edit to each fresh
// object, preserving unrelated fields and the observed native incarnation.
func (a *access) update(ctx context.Context, target hostconnections.ResolvedTarget, typ resource.ResourceType, namespace, name string, edit func(map[string]any) error) (resource.Record, error) {
	for attempt := range 3 {
		if err := ctx.Err(); err != nil {
			return resource.Record{}, err
		}
		record, err := a.get(ctx, target, typ, namespace, name)
		if err != nil {
			return resource.Record{}, err
		}
		if record.SourceRevision == nil || *record.SourceRevision == "" {
			return resource.Record{}, unsupported()
		}
		body, err := resource.NativeFromValue(record.Body)
		if err != nil {
			return resource.Record{}, err
		}
		object, ok := body.(map[string]any)
		if !ok {
			return resource.Record{}, unsupported()
		}
		if err := edit(object); err != nil {
			return resource.Record{}, err
		}
		input, err := resource.ValueFromNative(object)
		if err != nil {
			return resource.Record{}, err
		}
		updated, err := a.client.Update(ctx, owner, target.TargetID, resource.MutationRequest{Route: a.route, Reference: record.Reference, Operation: "update", Input: input, ExpectedRevision: record.SourceRevision})
		if err == nil {
			return updated, nil
		}
		if resource.ErrorCode(err) != "CONFLICT" || attempt == 2 {
			return resource.Record{}, err
		}
	}
	panic("unreachable")
}
