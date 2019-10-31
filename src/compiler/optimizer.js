/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 * ! AST 优化 -> 判断是否是静态节点或者静态根，这些节点不会发现变化，不用进行对比
 */
export function optimize(root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  markStatic(root) // ! 标记静态节点
  // second pass: mark static roots.
  markStaticRoots(root, false) // ! 标记静态根
}

function genStaticKeys(keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
      (keys ? ',' + keys : '')
  )
}

// ! 标记静态节点的方法
function markStatic(node: ASTNode) {
  node.static = isStatic(node) // ! 判断是否是静态节点
  // ! 节点是普通元素
  if (node.type === 1) {
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      return
    }

    // ! 遍历子节点，递归
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)

      // ! 子节点如果不是静态的，则父节点也不是。下同
      if (!child.static) {
        node.static = false
      }
    }

    // ! 有 ifConditions 属性时，递归
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block // ! 获取对应条件的的元素
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

// ! 标记静态根的函数
function markStaticRoots(node: ASTNode, isInFor: boolean) {
  // ! 节点是标签元素
  if (node.type === 1) {
    if (node.static || node.once) {
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    if (
      node.static && // ! 本身是静态节点
      node.children.length && // ! 子节点也是静态节点
      // ! 子节点的长度不能为 1 且第一个子节点不能是一个纯文本或者注释节点
      !(node.children.length === 1 && node.children[0].type === 3)
    ) {
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }

    // ! children 属性同静态节点逻辑
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }

    // ! ifConditions 属性同静态节点逻辑
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

// ! 判断是不是静态节点的方法
function isStatic(node: ASTNode): boolean {
  // ! type 2 是含有字面量表达式的文本节点， 一定不是静态节点
  if (node.type === 2) {
    // expression
    return false
  }

  // ! type 3 是纯文本或者注释节点， 一定是静态节点
  if (node.type === 3) {
    // text
    return true
  }

  // ! type 1 是标签节点
  // ! 使用了 v-pre 指令或者是 pre 标签
  // ! 没有绑定属性 && 没有使用 v-if &&  没有使用 v-for && 不是内置标签(slot, component) &&
  // ！是平台的保留标签（不是组件） && 不是带有 v-for 的 template 标签 && 所有属性是静态属性
  return !!(
    node.pre ||
    (!node.hasBindings && // no dynamic bindings
    !node.if &&
    !node.for && // not v-if or v-for or v-else
    !isBuiltInTag(node.tag) && // not a built-in
    isPlatformReservedTag(node.tag) && // not a component
      !isDirectChildOfTemplateFor(node) &&
      Object.keys(node).every(isStaticKey))
  )
}

function isDirectChildOfTemplateFor(node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}
