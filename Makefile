
serve:
	hugo serve

# 初始化下载，更新到 .gitmodules 中指定的 commit
init:
	git submodule update --init

lint:
	npx @lint-md/cli  **/*

format:
	npx @lint-md/cli --fix **/*


EXCLUDE = --exclude "*webp" --exclude "*svg" --exclude "*gif"
IMG_PATH = ./static/images
webp:
	fd -t f $(EXCLUDE) --full-path $(IMG_PATH) --exec convert {} {.}.webp \;
	fd -t f $(EXCLUDE) --full-path $(IMG_PATH) --exec rm {} \;
