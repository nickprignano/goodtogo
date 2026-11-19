#!/bin/sh
set -e

mkdir -p /tmp/tools/bin

if ! command -v go >/dev/null 2>&1 && [ ! -x /tmp/tools/go/bin/go ]; then
  curl -sSL https://go.dev/dl/go1.26.0.linux-amd64.tar.gz | tar -xz -C /tmp/tools
fi

if ! command -v tinygo >/dev/null 2>&1 && [ ! -x /tmp/tools/tinygo/bin/tinygo ]; then
  curl -sSL https://github.com/tinygo-org/tinygo/releases/download/v0.41.1/tinygo0.41.1.linux-amd64.tar.gz | tar -xz -C /tmp/tools
fi

if ! command -v wasm-opt >/dev/null 2>&1 && [ ! -x /tmp/tools/bin/wasm-opt ]; then
  curl -sSL https://github.com/WebAssembly/binaryen/releases/download/version_121/binaryen-version_121-x86_64-linux.tar.gz | tar -xz -C /tmp/tools
  cp /tmp/tools/binaryen-version_121/bin/wasm-opt /tmp/tools/bin/wasm-opt
fi

export PATH="/tmp/tools/tinygo/bin:/tmp/tools/go/bin:/tmp/tools/bin:$PATH"
npm run build
