#!/usr/bin/env bash
echo "Run Entry..."
DIR="$(dirname "$(realpath "$0")")"
for ex in `ls -d */`;do
  echo "Run ${ex}..."
  cd ${DIR}/${ex}
  if [ -f part.sh ]; then
      ./part.sh
  fi
done