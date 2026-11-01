<script setup lang="ts">
import MsIcon from './MsIcon.vue'

// 今日任务卡（demo/index.html 今日任务卡实装版）：扇贝 blob + 圆形播放键 + 随机复习开关
defineProps<{
  /** 当前词典名（芯片展示） */
  dictName: string
  /** 任务状态文案（进行中 / 已完成） */
  tag: string
  /** 今日已学分钟数 */
  minutes: number
  /** 每日目标（词/天） */
  dailyGoal: number
  randomReview: boolean
}>()

const emit = defineEmits<{
  /** 点击播放键：进入单词练习 */
  (e: 'play'): void
  /** 开始复习：进入复习模式 */
  (e: 'review'): void
  /** 添加单词：进入导入单词向导页 */
  (e: 'add-word'): void
  (e: 'update:randomReview', value: boolean): void
}>()

function onSwitchChange(e: Event) {
  const selected = !!(e.target as any)?.selected
  emit('update:randomReview', selected)
}
</script>

<template>
  <m-card class="m3e-card" variant="filled">
    <div class="m3e-card-body m3e-hero">
      <div class="m3e-hero-main">
        <div class="m3e-card-title">
          <span class="m3e-title-chip"><MsIcon name="flag" :size="18" /></span>
          {{ $t('today_task') }}
          <span class="m3e-tag">{{ tag }}</span>
        </div>
        <div class="m3e-hero-id">
          <span class="m3e-avatar-chip">{{ dictName }}</span>
          <div class="m3e-hero-num">
            {{ minutes }}<span class="unit">{{ $t('m3e_minutes') }}</span>
          </div>
        </div>
        <div class="m3e-hero-actions">
          <m-button variant="tonal" @click="emit('review')">
            <span class="btn-inner"><MsIcon name="refresh" :size="18" />{{ $t('m3e_start_review') }}</span>
          </m-button>
          <m-button variant="outlined" @click="emit('add-word')">
            <span class="btn-inner"><MsIcon name="add" :size="18" />{{ $t('add_word') }}</span>
          </m-button>
        </div>
        <div class="m3e-hero-foot">
          <div class="kv">
            <span class="k">{{ $t('m3e_daily_goal') }}</span>
            <span class="v">{{ $t('m3e_words_per_day', { n: dailyGoal }) }}</span>
          </div>
          <div class="grow"></div>
          <m-switch :selected="randomReview" @change="onSwitchChange">{{ $t('random_review') }}</m-switch>
        </div>
      </div>
      <div class="m3e-hero-media">
        <!-- 扇贝 blob（demo 同款路径），颜色跟随主题 surface-container-high -->
        <svg class="blob" viewBox="0 0 200 200" aria-hidden="true">
          <path
            d="M178,100 Q191.8,124.6 167.5,139 Q167.2,167.2 139,167.5 Q124.6,191.8 100,178 Q75.4,191.8 61,167.5 Q32.8,167.2 32.5,139 Q8.2,124.6 22,100 Q8.2,75.4 32.5,61 Q32.8,32.8 61,32.5 Q75.4,8.2 100,22 Q124.6,8.2 139,32.5 Q167.2,32.8 167.5,61 Q191.8,75.4 178,100 Z"
            fill="var(--mtrl-sys-color-surface-container-high)"
          />
        </svg>
        <button class="m3e-play-btn" :aria-label="$t('m3e_start_study')" @click="emit('play')">
          <MsIcon name="play_arrow" :size="42" />
        </button>
      </div>
    </div>
  </m-card>
</template>

<style scoped lang="scss">
.m3e-hero {
  position: relative;
  flex-direction: row;
  align-items: center;
  gap: 16px;
  overflow: visible;
  padding-right: 0;
}
.m3e-hero-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  position: relative;
  z-index: 1;
}
.m3e-tag {
  margin-left: 2px;
  background: var(--mtrl-sys-color-surface-container-highest);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--mtrl-sys-color-on-surface-variant);
  font-weight: 400;
}
.m3e-hero-id {
  display: flex;
  align-items: center;
  gap: 14px;
}
.m3e-avatar-chip {
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  background: var(--mtrl-sys-color-surface-container-highest);
  color: var(--mtrl-sys-color-on-surface);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  white-space: nowrap;
}
.m3e-hero-num {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 44px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -1px;
  color: var(--mtrl-sys-color-on-surface);
  .unit {
    font-size: 15px;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--mtrl-sys-color-on-surface-variant);
  }
}
.m3e-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.btn-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.m3e-hero-foot {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--mtrl-sys-color-outline-variant);
  .kv {
    display: flex;
    align-items: baseline;
    gap: 8px;
    white-space: nowrap;
  }
  .k {
    color: var(--mtrl-sys-color-on-surface-variant);
    font-size: 12px;
  }
  .v {
    font-size: 14px;
    font-weight: 600;
  }
  .grow {
    flex: 1;
  }
  m-switch {
    flex: 0 0 auto;
    white-space: nowrap;
  }
}
.m3e-hero-media {
  position: relative;
  flex: 0 0 auto;
  width: 160px;
  height: 156px;
  .blob {
    position: absolute;
    right: -162px;
    top: 50%;
    width: 330px;
    height: 330px;
    transform: translateY(-50%);
  }
}
.m3e-play-btn {
  position: absolute;
  right: 34px;
  top: 50%;
  z-index: 1;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transform: translateY(-50%);
  background: var(--mtrl-sys-color-primary);
  color: var(--mtrl-sys-color-on-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 28px color-mix(in srgb, var(--mtrl-sys-color-primary) 30%, transparent);
  transition: transform 0.2s ease;
  &:hover {
    transform: translateY(-50%) scale(1.04);
  }
  &:active {
    transform: translateY(-50%) scale(0.96);
  }
}

@media (max-width: 767px) {
  .m3e-hero-media {
    width: 120px;
    height: 120px;
    .blob {
      right: -140px;
      width: 260px;
      height: 260px;
    }
  }
  .m3e-play-btn {
    width: 64px;
    height: 64px;
    right: 24px;
  }
}
</style>
