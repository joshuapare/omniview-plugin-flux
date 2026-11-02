package main

import (
	"log"

	"github.com/mononendev/omniview-plugin-flux/pkg/flux"
	"github.com/omniviewdev/plugin-sdk/pkg/sdk"
)

func main() {
	plugin := sdk.NewPlugin(sdk.PluginOpts{ID: "flux"})
	if err := flux.Register(plugin); err != nil {
		log.Fatal(err)
	}
	plugin.Serve()
}
