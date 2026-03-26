
serve:
	zine --port 1313

lint:
	npx @lint-md/cli $$(git ls-files '*.smd')

format:
	npx @lint-md/cli --fix $$(git ls-files '*.smd')


EXCLUDE = --exclude "*webp" --exclude "*svg" --exclude "*gif"
IMG_PATH = ./static/images
webp:
	fd -t f $(EXCLUDE) --full-path $(IMG_PATH) --exec convert {} {.}.webp \;
	fd -t f $(EXCLUDE) --full-path $(IMG_PATH) --exec rm {} \;
