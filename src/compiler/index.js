/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// ! 基础编译器
function baseCompile(
  template: string,
  options: CompilerOptions
): CompiledResult {
  const ast = parse(template.trim(), options) // ! 生成 AST, 模板字符串 => AST (通用方法，所有平台都一样)

  if (options.optimize !== false) {
    optimize(ast, options) // ! 优化语法树 (不同平台不一样)
  }

  const code = generate(ast, options) // ! 生成代码, AST => code (不同平台不一样)

  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
}

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
// ! 编译器创建者的创建者
export const createCompiler = createCompilerCreator(baseCompile)
