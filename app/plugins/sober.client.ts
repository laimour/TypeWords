// Sober 为 Web Components 库，只能在客户端导入，避免 SSR 阶段 HTMLElement is not defined
// mtrl 的注册与图标样式注入见 plugins/mtrl.client.ts
import 'sober'

export default defineNuxtPlugin(() => {})
