#!/usr/bin/env bash
echo "Run Part..."
DIR="$(dirname "$(realpath "$0")")"
for ex in `ls -d */`;do
  echo "Run example ${ex}..."
  cd ${DIR}/${ex}
  if [ -f build.zig ]; then
       zig build --summary none
  fi
done
