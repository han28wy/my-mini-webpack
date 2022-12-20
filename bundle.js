//  操作指导 https://github.com/Sunny-lucking/howToBuildMyWebpack
const fs = require('fs')
const path = require('path')
const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default // 这个是做收集依赖的
const babel = require('@babel/core') // 这个是做es6=>es5的包
const { get } = require('http')


const getModuleInfo = (file) =>{
    const body = fs.readFileSync(file, 'utf-8') // 1 读取模块内容
    // 2 利用插件把代码解析成AST
    const ast = parser.parse(body, {
        sourceType:'module' // 表示解析对象是es module
    })

    // 3 遍历AST 把用到的依赖收集起来(将用import语句引入的文件路径收集起来,放到deps里)
    const deps = {}
    traverse(ast, {
        ImportDeclaration({node}){ // ImportDeclaration方法代表的是对type类型为ImportDeclaration的节点的处理。
            const dirname = path.dirname(file)
            const abspath = './' + path.join(dirname,node.source.value) // 这里获取了import的值
            deps[node.source.value] = abspath
        }
    })
    // console.log(deps); // 输出 { './add': './src\\add', './minus': './src\\minus' }

    // 4 es6=>es5
    const {code} = babel.transformFromAst(ast,null,{ // 把ast转换成第三个参数里配置的模块类型
        presets:["@babel/preset-env"]
    })
    // console.log(code);
 
    const moduleInfo = {file,deps,code} // 这个对象包括该模块的路径（file），该模块的依赖（deps），该模块转化成es5的代码
    return moduleInfo
}

// getModuleInfo("./src/index.js")

//7 递归的获取模块里依赖模块的信息
const parseModules= (file)=> {
    const entry = getModuleInfo(file)
    const temp = [entry]
    for(let i=0;i<temp.length;i++){
        const deps = temp[i].deps
        if(deps){
            for(const key in deps){
                if(deps.hasOwnProperty(key)){
                    temp.push(getModuleInfo(deps[key]))
                }
            }
        }
    }
    // 不过现在的temp数组里的对象格式不利于后面的操作，
    // 我们希望是以文件的路径为key，{code，deps}为值的形式存储
    const depsGraph = {}
    temp.forEach(moduleInfo=>{
        depsGraph[moduleInfo.file] = {
            deps:moduleInfo.deps,
            code:moduleInfo.code
        }
    })
    return depsGraph
}
// parseModules("./src/index.js")

// 8 封装打包后的文件

// 把保存下来的depsGraph，传入一个立即执行函数。
// 将主模块路径传入require函数执行
// 执行reuire函数的时候，又立即执行一个立即执行函数，这里是把code的值传进去了
// 执行eval（code）。也就是执行主模块的code这段代码
const bundle = (file) =>{
    const depsGraph = JSON.stringify(parseModules(file))
    return `(function (graph) {
        function require(file) {
            function absRequire(relPath) {
                return require(graph[file].deps[relPath])
            }
            var exports = {}
            (function (require,exports,code) {
                eval(code)
            })(absRequire,exports,graph[file].code)
            return exports
        }
        require('${file}')
    })(${depsGraph})`
}

const content = bundle('./src/index.js')

//写入到我们的dist目录下
fs.mkdirSync('./dist');
fs.writeFileSync('./dist/bundle.js',content)