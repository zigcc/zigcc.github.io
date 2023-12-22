
serve:
	hugo serve

# 初始化下载，更新到 .gitmodules 中指定的 commit
init:
	git submodule update --init

lint:
	npx prettier@3.1.1 . --check

format:
	npx prettier@3.1.1 --write .
