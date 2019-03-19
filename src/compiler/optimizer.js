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
 * ! AST 优化，判断是否是静态节点或者静态根，这些节点不会发现变化，不用进行对比
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
  node.static = isStatic(node) // ! 判断静态节点
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

    // ! 有 if 时，递归
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block // ! 对应的 AST 节点
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

// ! 标记静态根的方法
function markStaticRoots(node: ASTNode, isInFor: boolean) {
  // ! 节点是普通元素
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
      !(node.children.length === 1 && node.children[0].type === 3) // ! 子节点的长度不能为 1 且不能是一个纯文本
    ) {
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }

    // ! 同静态节点逻辑，下同
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

// ! 判断静态节点的方法
function isStatic(node: ASTNode): boolean {
  // ! type 2 是表达式， 不是静态节点
  if (node.type === 2) {
    // expression
    return false
  }

  // ! type 3 是纯文本， 是静态节点
  if (node.type === 3) {
    // text
    return true
  }

  // ! type 1 是普通元素
  return !!(
    node.pre || // ! 使用 v-pre 是静态的
    (!node.hasBindings && // no dynamic bindings
    !node.if &&
    !node.for && // not v-if or v-for or v-else
    !isBuiltInTag(node.tag) && // not a built-in
    isPlatformReservedTag(node.tag) && // ! not a component 是保留的标签
    !isDirectChildOfTemplateFor(node) && // ! 非带有 v-for 的 template 标签的直接子节点
      Object.keys(node).every(isStaticKey))
  ) // ! 节点的所有属性的 key 都满足静态 key
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
