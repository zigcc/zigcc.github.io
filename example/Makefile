fmt:
	zig fmt --check src/*.zig

build: fmt
	zig build -Doptimize=ReleaseFast -Dstrip=true
