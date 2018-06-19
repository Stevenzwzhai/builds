const { readFileSync, writeFileSync } = require('fs')
const path = require('path')
const traverse = require('babel-traverse').default
const { transformFromAst, transform } = require('babel-core')

let id = 0;

const currentPath = process.cwd();
//解析单个文件
function parseDependecies(filename) {
	const rowCode = readFileSync(filename, 'utf-8')
	const ast = transform(rowCode).ast
	const dependencies = []
	//收集依赖
	traverse(ast, {
		ImportDeclaration(path) {
			const sourcePath = path.node.source.value
			dependencies.push(sourcePath)
		}
	})
	//转化代码
	const es5Code = transformFromAst(ast, null, {
		presets: ['env']
	}).code
	//把代码传入loader中做进一步转化
	const customCode = loader(filename, es5Code);

	return {
		id: id++,
		code: customCode,
		dependencies, 
		filename
	}
}	

//解析所有的文件
function parseGraph(entry) {
	//从入口文件开始		
	const entryAsset = parseDependecies(path.resolve(currentPath, entry))
	//吧入口文件放在最开头
	const graph = [entryAsset]
	/*

		在这里我们使用 for of 循环而不是 forEach ，原因是因为我们在循环之中会不断的向 graph 中，push 进东西，graph 会不断增加，用 for of 会一直持续这个循环直到 graph 不会再被推进去东西，这就意味着，所有的依赖已经解析完毕，graph 数组数量不会继续增加，但是用 forEach 是不行的，只会遍历一次。
	*/
	//这里重复的依赖是否搞个缓存来优化下重复解析
	//cache modules
	const cacheModules = {}
	for(const asset of graph) {
		if(!asset.idMapping){
			asset.idMapping = {}
		}
		const dir = path.dirname(asset.filename)
		asset.dependencies.forEach(dependencyPath => {
			const absolutePath = path.resolve(dir, dependencyPath)
			cacheModules[absolutePath] = cacheModules[absolutePath] || parseDependecies(absolutePath)
			const dependencyAsset = cacheModules[absolutePath];
			const id = dependencyAsset.id
			//通过ID找到对应的模块
			asset.idMapping[dependencyPath] = dependencyAsset.id
			graph.push(dependencyAsset)
		})
	}
	// 所有文件模块组成的集合叫做 graph（依赖图）
	return graph
}

function build(graph) {
	let modules = ''

	graph.forEach(asset => {
		modules += `
			${asset.id}:[
				function(require, module, exports){
					${asset.code}
				},
				${JSON.stringify(asset.idMapping)}
			],
		`
	})

	const wrap = `
		(function(modules) {
			function require(id) {
				const [fn, idMapping] = modules[id]
				function childRequire(filename) {
					return require(idMapping[filename])
				}
				const newModule = {exports: {}}
				fn(childRequire, newModule, newModule.exports)
				return newModule.exports
			}
			require(0)
		})({${modules}})
	`

	return wrap
}

function loader(filename, code){
	if(/index/.test(filename)){
		console.log('this is a loader')
	}
	return code;
}

module.exports = (entry) => {
	const graph = parseGraph(entry)
	const bundle = build(graph)
	return bundle
}



