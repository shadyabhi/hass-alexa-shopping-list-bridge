## Docker notes

### Build

```bash
# Build the image
docker build -t hass-amazon-shopping-list-bridge .

# Run the container
docker run --rm -it hass-amazon-shopping-list-bridge /bin/sh
```
### Publish

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t shadyabhi/hass-amazon-shopping-list-bridge --push .
```

Then, image is available at: https://hub.docker.com/repositories/shadyabhi
