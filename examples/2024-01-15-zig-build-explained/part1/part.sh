#!/usr/bin/env bash
echo "Run Part..."
DIR="$(dirname "$(realpath "$0")")"
for ex in `ls -d */`;do
  echo "Run example ${ex}..."
  cd ${DIR}/${ex}
  zig build --summary none
done
