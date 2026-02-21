#!/bin/bash
set -e

# Fetch all tags from Docker Hub
echo "Fetching tags from Docker Hub..."
TAGS=$(curl -s "https://hub.docker.com/v2/repositories/shadyabhi/alexa-shopping-list-bridge/tags?page_size=100" | jq -r '.results[].name | select(test("^[0-9]+\\.[0-9]+\\.[0-9]+$"))')

if [ -z "$TAGS" ]; then
    echo "No tags found. Defaulting to 0.0.0"
    VERSION="0.0.0"
else
    # Find the latest version
    VERSION=$(echo "$TAGS" | sort -V | tail -n 1)
    echo "Latest version: $VERSION"
fi

# Increment version (assuming semantic versioning X.Y.Z)
IFS='.' read -r -a parts <<< "$VERSION"
MAJOR=${parts[0]}
MINOR=${parts[1]}
PATCH=${parts[2]}

PATCH=$((PATCH + 1))
NEXT_VERSION="$MAJOR.$MINOR.$PATCH"

echo "Next version: $NEXT_VERSION"

# Confirm with user
read -p "Do you want to publish version $NEXT_VERSION? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Update version in config.yaml
CONFIG_FILE="hass-addon-alexa-shopping-list/config.yaml"
echo "Updating version in $CONFIG_FILE to $NEXT_VERSION"
sed -i.tmp "s/^version: \".*\"/version: \"$NEXT_VERSION\"/" "$CONFIG_FILE"
rm -f "${CONFIG_FILE}.tmp"

# Run make bp
echo "Running make bp VERSION=$NEXT_VERSION"
make bp VERSION=$NEXT_VERSION
