## Docker notes

Image is available at: https://hub.docker.com/repositories/shadyabhi

### Build

```bash
# Build the image
docker build -t alexa-shopping-list-bridge .

# Run the container
docker run --rm -it alexa-shopping-list-bridge /bin/sh
```
### Publish

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t shadyabhi/alexa-shopping-list-bridge --push .
```
