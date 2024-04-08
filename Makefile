
serve:
	hugo serve

# 初始化下载，更新到 .gitmodules 中指定的 commit
init:
	git submodule update --init

lint:
	npx @lint-md/cli  .
	npx prettier@3.1.1 . --check

format:
	npx @lint-md/cli --fix .
	npx prettier@3.1.1 --write .
