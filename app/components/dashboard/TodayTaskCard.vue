<script setup lang="ts">
import MsIcon from './MsIcon.vue'

// 今日任务卡（排版按优化版 demo：标题行 → 时长+进度 → 目标行 → 按钮行 → 底部开关）
// 右侧 .m3e-hero-media / .blob / .m3e-play-btn 为固定定位的大播放键与背景，不要挪动
defineProps<{
  /** 当前词典名（标题行芯片展示） */
  dictName: string
  /** 任务状态文案（进行中 / 已完成） */
  tag: string
  /** 任务是否进行中（决定状态点颜色） */
  inProgress: boolean
  /** 今日已学分钟数 */
  minutes: number
  /** 今日已学新词数（显示在“今日已学 X 分钟”右侧） */
  newWords: number
  /** 今日目标完成百分比（今日新学词数 / 每日目标） */
  progress: number
  /** 今日生效的每日目标（含临时目标） */
  dailyGoal: number
  /** 是否正在使用“仅今天”的临时目标 */
  tempGoalActive: boolean
  randomReview: boolean
}>()

const emit = defineEmits<{
  /** 点击播放键：进入单词练习 */
  (e: 'play'): void
  /** 开始复习：进入复习模式 */
  (e: 'review'): void
  /** 修改每日目标（写入词典设置） */
  (e: 'edit-goal'): void
  /** 临时修改今日目标（仅今天生效） */
  (e: 'temp-goal'): void
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
        <!-- 1. 头部：任务名 + 词典芯片 + 状态（最右） -->
        <div class="hero-header">
          <span class="hero-title">
            <span class="m3e-title-chip"><MsIcon name="flag" :size="18" /></span>
            {{ $t('today_task') }}
          </span>
          <span class="m3e-dict-chip" :title="dictName">
            <MsIcon name="menu_book" :size="14" />
            <span class="m3e-dict-name">{{ dictName }}</span>
          </span>
          <span class="hero-status" :class="{ done: !inProgress }">{{ tag }}</span>
        </div>

        <!-- 2. 核心数据：今日已学分钟 + 今日目标进度条 -->
        <div class="hero-stats">
          <span class="hero-cap">{{ $t('m3e_today_learned') }}</span>
          <div class="m3e-hero-num">
            {{ minutes }}<span class="unit">{{ $t('m3e_minutes') }}</span>
            <span class="words-learned">{{ $t('m3e_today_words', { n: newWords }) }}</span>
          </div>
          <m-progress
            class="hero-progress"
            variant="linear"
            :value="progress"
            max="100"
            shape="wavy"
            thickness="5"
            :aria-label="$t('m3e_today_learned')"
          ></m-progress>
        </div>

        <!-- 3. 目标行：每日目标（可点改）+ 临时修改 -->
        <div class="hero-goal-row">
          <span class="hero-goal-label">{{ $t('m3e_daily_goal') }}</span>
          <button class="goal-value" type="button" @click="emit('edit-goal')">
            {{ $t('m3e_words_per_day', { n: dailyGoal }) }}
            <MsIcon name="edit" :size="14" />
          </button>
          <button class="temp-goal-btn" type="button" @click="emit('temp-goal')">
            <MsIcon name="schedule" :size="14" />{{ $t('m3e_temp_goal') }}
          </button>
          <span v-if="tempGoalActive" class="goal-badge">{{ $t('m3e_temp_badge') }}</span>
        </div>

        <!-- 4. 操作按钮 -->
        <div class="m3e-hero-actions">
          <m-button variant="tonal" @click="emit('review')">
            <span class="btn-inner"><MsIcon name="refresh" :size="18" />{{ $t('m3e_start_review') }}</span>
          </m-button>
          <m-button variant="outlined" @click="emit('edit-goal')">
            <span class="btn-inner"><MsIcon name="tune" :size="18" />{{ $t('m3e_edit_goal') }}</span>
          </m-button>
        </div>

        <!-- 5. 底部开关（靠右，细线分隔） -->
        <div class="hero-controls">
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
  gap: 14px;
  position: relative;
  z-index: 1;
}

/* ---------------- 头部 ---------------- */
.hero-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  row-gap: 6px;
}
.hero-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--mtrl-sys-color-on-surface);
  white-space: nowrap;
}
.m3e-dict-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 40%;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--mtrl-sys-color-outline-variant);
  background: var(--mtrl-sys-color-surface-container-high);
  color: var(--mtrl-sys-color-on-surface-variant);
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  :deep(.ms-icon) {
    color: var(--mtrl-sys-color-primary);
    flex: 0 0 auto;
  }
  .m3e-dict-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
/* 状态：最右，带小圆点（进行中为绿色，已完成转灰） */
.hero-status {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  color: #8bc34a;
  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 8px color-mix(in srgb, currentColor 50%, transparent);
  }
  &.done {
    color: var(--mtrl-sys-color-on-surface-variant);
    &::before {
      box-shadow: none;
    }
  }
}

/* ---------------- 核心数据 ---------------- */
.hero-stats {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.hero-cap {
  font-size: 12px;
  color: var(--mtrl-sys-color-on-surface-variant);
  letter-spacing: 0.2px;
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
  /* 今日已学单词数：紧随分钟单位右侧，不参与右侧巨型播放键的定位 */
  .words-learned {
    font-size: 15px;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--mtrl-sys-color-on-surface-variant);
    white-space: nowrap;
    flex: 0 0 auto;
  }
}
.hero-progress {
  width: 100%;
  margin-top: 2px;
}

/* ---------------- 目标行 ---------------- */
.hero-goal-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  row-gap: 8px;
}
.hero-goal-label {
  font-size: 13px;
  color: var(--mtrl-sys-color-on-surface-variant);
  white-space: nowrap;
}
.goal-value {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  padding: 2px 0;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--mtrl-sys-color-on-surface);
  white-space: nowrap;
  :deep(.ms-icon) {
    color: var(--mtrl-sys-color-on-surface-variant);
  }
  &:hover :deep(.ms-icon) {
    color: var(--mtrl-sys-color-primary);
  }
}
/* 临时修改：紫色小胶囊（demo 同款位置：每日目标旁边） */
.temp-goal-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid color-mix(in srgb, var(--mtrl-sys-color-primary) 22%, transparent);
  background: color-mix(in srgb, var(--mtrl-sys-color-primary) 12%, transparent);
  color: var(--mtrl-sys-color-primary);
  border-radius: 10px;
  padding: 3px 9px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s ease;
  &:hover {
    background: color-mix(in srgb, var(--mtrl-sys-color-primary) 20%, transparent);
  }
}
.goal-badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--mtrl-sys-color-primary-container);
  color: var(--mtrl-sys-color-on-primary-container);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
}

/* ---------------- 按钮行 ---------------- */
.m3e-hero-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.btn-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* ---------------- 底部开关 ---------------- */
.hero-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-top: 14px;
  border-top: 1px solid var(--mtrl-sys-color-outline-variant);
}

/* ---------------- 右侧主操作（位置固定，不要动） ---------------- */
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
