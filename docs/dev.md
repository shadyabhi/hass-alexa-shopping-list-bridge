## Docker notes

Image is available at: https://hub.docker.com/repositories/shadyabhi

### Publish

```bash
# Update @CHANGELOG.md


# Build and push
make publish
```
### Image development

```bash
# No publish is done
docker buildx build --platform linux/amd64,linux/arm64 -t shadyabhi/alexa-shopping-list-bridge .

# Inspect locally
docker run --rm -v $(pwd)/data:/app/data -v ./config.hjson:/app/config.hjson -it shadyabhi/alexa-shopping-list-bridge
```
