
serve:
	zine

lint:
	npx @lint-md/cli  **/*

format:
	npx @lint-md/cli --fix **/*


EXCLUDE = --exclude "*webp" --exclude "*svg" --exclude "*gif"
IMG_PATH = ./static/images
webp:
	fd -t f $(EXCLUDE) --full-path $(IMG_PATH) --exec convert {} {.}.webp \;
	fd -t f $(EXCLUDE) --full-path $(IMG_PATH) --exec rm {} \;
