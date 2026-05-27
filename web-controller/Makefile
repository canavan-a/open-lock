CGO_ENABLED=0

build: build-ui
	go build -o bin/web-controller .

build-ui:
	cd ui && npm install && npm run build

run:
	CGO_ENABLED=0 go run .

dev-ui:
	cd ui && npm run dev

.PHONY: build build-ui run dev-ui
