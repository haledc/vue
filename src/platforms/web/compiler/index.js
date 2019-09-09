/* @flow */

import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'

// ! 编译器创建者
const { compile, compileToFunctions } = createCompiler(baseOptions)

export { compile, compileToFunctions }
