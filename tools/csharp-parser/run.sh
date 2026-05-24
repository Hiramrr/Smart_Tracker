#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLISH_DIR="$SCRIPT_DIR/publish"
EXECUTABLE="$PUBLISH_DIR/FortniteReplayCSharpParser"

if [ -x "$EXECUTABLE" ]; then
  exec "$EXECUTABLE" "$@"
fi

REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOCAL_DOTNET="/tmp/dotnet-fortnite-test/dotnet"

if command -v dotnet >/dev/null 2>&1; then
  DOTNET_BIN="$(command -v dotnet)"
elif [ -x "$LOCAL_DOTNET" ]; then
  DOTNET_BIN="$LOCAL_DOTNET"
else
  echo "No encontre el binario publicado ni dotnet." >&2
  echo "En Docker el parser deberia estar publicado en $PUBLISH_DIR." >&2
  echo "En desarrollo, instala .NET 10 o vuelve a crear el runtime temporal en /tmp/dotnet-fortnite-test." >&2
  exit 1
fi

cd "$REPO_DIR"
exec "$DOTNET_BIN" run --project "$SCRIPT_DIR/FortniteReplayCSharpParser.csproj" -- "$@"
