
serve:
	zine --port 1313

lint:
	autocorrect --lint $$(git ls-files '*.smd')

format:
	autocorrect --fix $$(git ls-files '*.smd')


EXCLUDE = --exclude "*webp" --exclude "*svg" --exclude "*gif"
IMG_PATH = ./static/images
webp:
	fd -t f $(EXCLUDE) --full-path $(IMG_PATH) --exec convert {} {.}.webp \;
	fd -t f $(EXCLUDE) --full-path $(IMG_PATH) --exec rm {} \;
