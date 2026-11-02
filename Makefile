PLUGIN_ID := flux
PLATFORMS ?= darwin_arm64 darwin_amd64 linux_amd64 linux_arm64 windows_amd64
# Releases pass the tag here; the default is whatever plugin.yaml says.
VERSION ?= $(shell sed -n 's/^version: *//p' plugin.yaml)

override export GOWORK := off
override export GOFLAGS :=
GOOS ?= $(shell go env GOOS)
PLUGIN_BIN := plugin$(if $(filter windows,$(GOOS)),.exe,)

.PHONY: init build build-go test package clean

init:
	cd ui && pnpm install --frozen-lockfile

build: init
	cd ui && pnpm build

build-go:
	mkdir -p build/bin
	CGO_ENABLED=0 go build -trimpath -o build/bin/$(PLUGIN_BIN) ./pkg

test:
	go test ./...

# Produces dist/<id>-<os>_<arch>.tar.gz with a platform-specific backend.
package: build
	rm -rf dist
	mkdir -p dist/pkg/assets dist/pkg/bin
	sed "s/^version: .*/version: $(VERSION)/" plugin.yaml > dist/pkg/plugin.yaml
	cp -R ui/dist/assets/. dist/pkg/assets/
	for platform in $(PLATFORMS); do \
		os=$${platform%_*}; arch=$${platform#*_}; \
		name=plugin; if [ "$$os" = windows ]; then name=plugin.exe; fi; \
		rm -f dist/pkg/bin/plugin dist/pkg/bin/plugin.exe; \
		CGO_ENABLED=0 GOOS=$$os GOARCH=$$arch go build -trimpath -o dist/pkg/bin/$$name ./pkg || exit $$?; \
		COPYFILE_DISABLE=1 tar -czf dist/$(PLUGIN_ID)-$$platform.tar.gz -C dist/pkg plugin.yaml assets bin || exit $$?; \
	done
	rm -rf dist/pkg

clean:
	rm -rf dist ui/dist build
