CGO_ENABLED=0

build:
	go build -o bin/web-controller .

# UI_DIR=../mobile/dist make run serves the web build too (npm run build:web
# in ../mobile).
run:
	CGO_ENABLED=0 go run .

.PHONY: build run
