<script setup lang="ts">
import { BaseIcon, ToastComponent } from '@/base'
import IeDialog from '@/components/dialog/IeDialog.vue'
import useTheme from '@/core/hooks/theme.ts'
import { useRuntimeStore } from '@/core/stores/runtime.ts'
import { useSettingStore } from '@/core/stores/setting.ts'
import { ShortcutKey } from '@/core/types/enum.ts'
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { useInit } from '@/core/composables/useInit.ts'
import { useI18n } from 'vue-i18n'
import { isWebDavConfigured } from '@/core/utils/webdav.ts'
import { useWebDavSync } from '@/core/composables/useWebDavSync.ts'
import MiniProgram from '@/components/MiniProgram.vue'
import WordCollectPopover from '@/components/word/WordCollectPopover.vue'
import { msIcon } from '@/components/dashboard/icons'

const router = useRouter()
const { toggleTheme, getTheme, setTheme } = useTheme()
const runtimeStore = useRuntimeStore()
const settingStore = useSettingStore()
const init = useInit()

/* ---------------- 左侧 M3 Navigation Rail（demo 同款） ---------------- */

/** 收起 / 展开时侧边栏宽度（96px rail / 280px 展开） */
const RAIL_WIDTH = '96px'
const RAIL_EXPANDED_WIDTH = '280px'

function syncAsideWidth(expanded: boolean) {
  document.documentElement.style.setProperty('--aside-width', expanded ? RAIL_EXPANDED_WIDTH : RAIL_WIDTH)
}

const { locales, setLocale, t: $t } = useI18n()
const route = useRoute()

const railItems = $computed(() => [
  { value: 'words', label: $t('words'), icon: msIcon('home'), path: '/words' },
  { value: 'articles', label: $t('articles'), icon: msIcon('menu_book'), path: '/articles' },
  { value: 'feedback', label: $t('feedback'), icon: msIcon('forum'), path: '/feedback' },
  { value: 'doc', label: $t('document'), icon: msIcon('description'), path: '/doc' },
  { value: 'help', label: $t('help'), icon: msIcon('help'), path: '/help' },
  { value: 'setting', label: $t('setting'), icon: msIcon('settings'), path: '/setting' },
])

const activeRail = $computed(() => {
  const path = route.path || ''
  return railItems.find(i => path === i.path || path.startsWith(`${i.path}/`))?.value ?? ''
})

function onRailChange(e: Event) {
  const value = (e as CustomEvent<{ value: string }>).detail?.value
  const item = railItems.find(i => i.value === value)
  if (item) router.push(item.path)
  // 侧边栏点「单词」：即使已经在 /words（不会重新 mount）也同步一次
  if (item?.value === 'words') {
    void useWebDavSync()
      .syncAll({ reason: 'words-nav' })
      .catch(() => {})
  }
}

watch(
  () => settingStore.load,
  n => {
    if (!n) return
    setTheme(settingStore.theme)
  }
)

watch(
  () => settingStore.theme,
  n => {
    setTheme(n)
  }
)

const showIcon = $computed(() => {
  return ['/words', '/articles', '/setting', '/help', '/doc', '/feedback'].includes(route.path)
})

onMounted(() => {
  init()
  window.umami?.track('sync', { check: isWebDavConfigured() })
})
</script>

<template>
  <div class="layout anim">
    <!--    第一个aside 占位用-->
    <div class="aside space"></div>
    <div class="aside fixed rail-aside">
      <m-navigation-rail
        :value="activeRail || undefined"
        expanded-width="280"
        :expand-label="$t('expand')"
        :collapse-label="$t('collapse')"
        @change="onRailChange"
        @expand="syncAsideWidth(true)"
        @collapse="syncAsideWidth(false)"
      >
        <m-navigation-rail-item
          v-for="item in railItems"
          :key="item.value"
          :value="item.value"
          :label="item.label"
          :icon="item.icon"
          :badge="item.value === 'setting' && runtimeStore.isError ? '' : undefined"
        />
      </m-navigation-rail>
    </div>

    <!-- 移动端顶部菜单栏 -->
    <div class="mobile-top-nav" :class="{ collapsed: settingStore.mobileNavCollapsed }">
      <div class="nav-items">
        <div class="nav-item" @click="router.push('/')" :class="{ active: route.path === '/' }">
          <IconFluentHome20Regular />
          <span>{{ $t('home_page') }}</span>
        </div>
        <div class="nav-item" @click="router.push('/words')" :class="{ active: route.path?.includes('/words') }">
          <IconFluentTextUnderlineDouble20Regular />
          <span>{{ $t('words') }}</span>
        </div>
        <div class="nav-item" @click="router.push('/articles')" :class="{ active: route.path?.includes('/articles') }">
          <IconFluentBookLetter20Regular />
          <span>{{ $t('articles') }}</span>
        </div>
        <div class="nav-item" @click="router.push('/setting')" :class="{ active: route.path === '/setting' }">
          <IconFluentSettings20Regular />
          <span>{{ $t('setting') }}</span>
          <div class="red-point" v-if="runtimeStore.isError"></div>
        </div>
      </div>
      <div class="nav-toggle" @click="settingStore.mobileNavCollapsed = !settingStore.mobileNavCollapsed">
        <IconFluentChevronDown20Filled v-if="!settingStore.mobileNavCollapsed" />
        <IconFluentChevronUp20Filled v-else />
      </div>
    </div>

    <IeDialog />

    <div class="flex-1 z-1 relative main-content overflow-x-hidden">
      <div
        class="mt-3 center relative z-9999 pointer-events-none"
        @click="router.push('/setting?index=6 ')"
        v-if="runtimeStore.isError"
      >
        <ToastComponent
          type="error"
          :duration="0"
          :shadow="false"
          :showClose="false"
          :message="$t('sync_failed_toast')"
        />
      </div>
      <!--      <slot></slot>-->
      <router-view></router-view>

      <div class="absolute right-4 top-4 flex z-1 gap-2" v-if="showIcon">
        <MiniProgram v-if="settingStore.load && !settingStore.first" />

        <div class="relative group">
          <BaseIcon>
            <IconPhTranslate />
          </BaseIcon>
          <div
            class="space-y-2 pt-2 absolute z-2 right-0 opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 pointer-events-none group-hover:pointer-events-auto"
          >
            <div class="card mb-2 py-4 px-6 space-y-3">
              <div v-for="locale in locales" @click="setLocale(locale.code)" class="w-full cp break-keep black-link">
                {{ locale.name }}
              </div>
            </div>
          </div>
        </div>

        <BaseIcon
          :title="`${$t('toggle_theme')}(${settingStore.shortcutKeyMap[ShortcutKey.ToggleTheme]})`"
          @click="toggleTheme"
        >
          <IconFluentWeatherMoon16Regular v-if="getTheme() === 'light'" />
          <IconFluentWeatherSunny16Regular v-else />
        </BaseIcon>
      </div>
    </div>
    <WordCollectPopover />
  </div>
</template>

<style scoped lang="scss">
.layout {
  width: 100%;
  height: 100%;
  display: flex;
  background: var(--color-primary);
}

.aside {
  background: var(--md-sys-color-surface-container-low);
  height: 100vh;
  box-sizing: border-box;
  border-right: 1px solid var(--md-sys-color-outline-variant);
  width: var(--aside-width);
  transition: width 0.3s;
  z-index: 2;
  overflow: hidden;
}

/* M3 Navigation Rail（demo 同款）：96px 收起，展开按钮切到 280px */
.rail-aside {
  display: block;
  padding: 0;

  m-navigation-rail {
    display: block;
    height: 100%;
    /* 侧栏底色比页面高一级，和 demo 的 rail 面板观感一致 */
    --mtrl-sys-color-surface: var(--md-sys-color-surface-container-low);
  }
}

// 移动端顶部菜单栏
.mobile-top-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: var(--md-sys-color-surface-container-low);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  z-index: 1000;
  transition: all 0.3s ease;

  .nav-items {
    display: flex;
    justify-content: space-around;
    padding: 0.4rem 0.5rem;

    .nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0.35rem 0.9rem;
      cursor: pointer;
      border-radius: var(--md-sys-shape-full);
      transition: background-color 0.2s ease, color 0.2s ease;
      min-height: 44px;
      min-width: 44px;
      justify-content: center;
      position: relative;
      color: var(--md-sys-color-on-surface-variant);

      svg {
        font-size: 1.2rem;
        margin-bottom: 0.2rem;
        color: inherit;
      }

      span {
        font-size: 0.7rem;
        color: inherit;
        text-align: center;
      }

      &.active {
        background: var(--md-sys-color-secondary-container);
        color: var(--md-sys-color-on-secondary-container);
      }

      &:active {
        opacity: 0.8;
      }

      .red-point {
        position: absolute;
        top: 0.2rem;
        right: 0.4rem;
        width: 0.4rem;
        height: 0.4rem;
        background: var(--md-sys-color-error);
        border-radius: 50%;
      }
    }
  }

  .nav-toggle {
    position: absolute;
    bottom: -1.5rem;
    left: 50%;
    transform: translateX(-50%);
    background: var(--md-sys-color-surface-container-low);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-top: none;
    border-radius: 0 0 var(--md-sys-shape-md) var(--md-sys-shape-md);
    padding: 0.3rem 0.8rem;
    cursor: pointer;
    transition: all 0.3s;

    svg {
      font-size: 1rem;
      color: var(--md-sys-color-on-surface-variant);
    }

    &:active {
      transform: translateX(-50%) scale(0.95);
    }
  }

  &.collapsed {
    transform: translateY(calc(-100% + 1.5rem));

    .nav-items {
      opacity: 0;
      pointer-events: none;
    }
  }
}

.main-content {
  // 移动端时为主内容区域添加顶部内边距，避免被顶部菜单遮挡
  @media (max-width: 768px) {
    padding-top: 4rem;
  }
}

// 移动端隐藏左侧菜单栏
@media (max-width: 768px) {
  .aside {
    display: none;
  }

  .aside.space {
    display: none;
  }

  .main-content {
    width: 100%;
    margin-left: 0;
  }
}

// 桌面端隐藏移动端顶部菜单栏
@media (min-width: 769px) {
  .mobile-top-nav {
    display: none;
  }
}
</style>
