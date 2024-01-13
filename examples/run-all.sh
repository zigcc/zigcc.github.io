#!/usr/bin/env bash

DIR="$(dirname "$(realpath "$0")")"
for ex in `ls -d */`;do
  echo "Run example ${ex}..."
  cd ${DIR}/${ex}
  zig build --summary all
done
