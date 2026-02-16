bp:
	@if [ -z "$(VERSION)" ]; then echo "Error: VERSION is not set. Usage: make bp VERSION=0.0.1"; exit 1; fi
	docker buildx build --platform linux/amd64,linux/arm64 -t shadyabhi/alexa-shopping-list-bridge:$(VERSION) --push .

publish:
	./scripts/publish.sh
