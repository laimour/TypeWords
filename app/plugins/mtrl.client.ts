// mtrl（M3 Expressive Web Components）只能在客户端注册：元素定义依赖 HTMLElement/document
// 主题 token 桥接见 app/assets/css/m3e-tokens.scss（映射到项目 --md-sys-color-*，随 html.dark 切换）
import 'mtrl/styles/base'
import 'mtrl/elements/css'
import { defineAll } from 'mtrl/elements'

defineAll()

// mtrl 组件的 icon 属性是 setHTML 注入 shadow DOM 的 HTML 字符串，页面级 CSS 进不去。
// 图标本体使用内联 SVG（unplugin-icons ?raw，离线可用，颜色跟随 currentColor），
// 这里统一向每个 m-* 组件的 shadowRoot 注入 SVG 尺寸样式。
const iconCss = new CSSStyleSheet()
iconCss.replaceSync(`
  .mtrl-icon svg, slot::slotted(svg), slot-fb svg {
    width: 1em; height: 1em; fill: currentColor; display: block;
  }
`)

function injectIconStyles() {
  document.querySelectorAll('*').forEach(el => {
    const tagName = (el as Element).tagName
    if (!tagName.startsWith('M-')) return
    const root = (el as Element).shadowRoot
    if (root && !root.adoptedStyleSheets.includes(iconCss)) {
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, iconCss]
    }
  })
}

// 组件可在任意时机挂载（路由切换 / 弹窗），用 rAF 节流的 MutationObserver 兜底
let scheduled = false
function scheduleInject() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    injectIconStyles()
  })
}

export default defineNuxtPlugin(() => {
  injectIconStyles()
  const observer = new MutationObserver(scheduleInject)
  observer.observe(document.body, { childList: true, subtree: true })
})
