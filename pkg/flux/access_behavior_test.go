package flux

import (
	"context"
	"errors"
	"testing"

	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/omniviewdev/plugin-sdk/pkg/types"
)

type catalogFixture struct {
	pagesFixture
	catalogErr error
}

func (f *catalogFixture) Catalog(_ context.Context, _ string, _ resource.CatalogRequest) (resource.Catalog, error) {
	return testCatalog(), f.catalogErr
}

func TestOpenAccessPropagatesCatalogDenial(t *testing.T) {
	denied := errors.New("catalog denied")
	f := &catalogFixture{catalogErr: denied}
	a, err := openAccess(context.Background(), f, "cluster-a")
	if a != nil || !errors.Is(err, denied) {
		t.Fatalf("access=%v err=%v", a, err)
	}
}

func TestHandleRejectsInvalidInputsBeforeAccess(t *testing.T) {
	pc := &types.PluginContext{Context: context.Background()}
	for _, raw := range []string{`{`, `{"unknown":true}`} {
		if result, err := handle(pc, "status", []byte(raw)); err == nil || result != nil {
			t.Fatalf("input=%s result=%v err=%v", raw, result, err)
		}
	}
	if result, err := handle(pc, "status", []byte(`{}`)); result != nil || resource.ErrorCode(err) != "UNSUPPORTED" {
		t.Fatalf("missing connection: result=%v err=%v", result, err)
	}
}
