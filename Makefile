bp:
	docker buildx build --platform linux/amd64,linux/arm64 -t shadyabhi/hass-amazon-shopping-list-bridge --push .
