/* @flow */

import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'

// ! 生成模板编译器和生成渲染函数的编译器
const { compile, compileToFunctions } = createCompiler(baseOptions) // ! 编译器创建者

export { compile, compileToFunctions }
