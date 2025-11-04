docker build --platform linux/amd64 . -t sf-backend

# Push to ghcr.io
docker tag sf-backend ghcr.io/maelstromeous/satisfactory-factories:backend-latest
docker push ghcr.io/maelstromeous/satisfactory-factories:backend-latest

ssh sf "./update.sh"