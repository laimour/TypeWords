<script setup lang="ts">
import { BackIcon, BaseButton, BaseInput, BasePage, Toast, Textarea } from '@/base'
import WordFailedTable from '@/components/import/WordFailedTable.vue'
import { queryWord } from '@/core/apis/words.ts'
import { useBaseStore } from '@/core/stores/base.ts'
import { useRuntimeStore } from '@/core/stores/runtime.ts'
import { getDefaultDict, getDefaultWord } from '@/core/types/func.ts'
import type { Dict, Word } from '@/core/types/types.ts'
import { normalizeKey, parseImportText } from '@/core/utils/importWords.ts'
import { getDictUnits } from '@/core/utils/dict-units.ts'
import { _getDictDataByUrl, _nextTick, ensureCustomDictCopy, useNav } from '@/core/utils'
import saveAs from 'file-saver'
import { computed, ref } from 'vue'

type FailedRow = {
  id: string
  word: string
  checked: boolean
  editing: boolean
}

const base = useBaseStore()
const runtimeStore = useRuntimeStore()
const { nav } = useNav()

const step = ref(1)
const rawText = ref('')
const fileName = ref('')
const running = ref(false)
const progressText = ref('')

const dictMode = ref<'existing' | 'new'>('existing')
const selectedDictId = ref('')
const newDictName = ref('')

const officialCount = ref(0)
const dictCount = ref(0)
const manualCount = ref(0)
const skippedCount = ref(0)
/** 已存在但单元与导入不同的单词：不跳过，改为变更其单元 */
const unitMovedCount = ref(0)
const translatedCount = ref(0)
const failedRows = ref<FailedRow[]>([])
const importedUnitCount = ref(0)

const isCustomDict = (dict: Dict) => !!dict.custom || String(dict.id ?? '').startsWith('custom-')

const availableDicts = computed<Dict[]>(() => (base.word.bookList || []).filter(dict => !dict.system))

const loadingDicts = computed(() => !base.load)

const parsedCount = computed(() => parseImportText(rawText.value).length)
const parsedUnitCount = computed(
  () => new Set(parseImportText(rawText.value).map(item => item.unit).filter(v => v !== undefined)).size
)

/** 导入目标单元选择：'' 不分配；'__new__' 新建；其他为单元名 */
const unitChoice = ref('__new__')
const newUnitName = ref('')

/** 没有单元标题的词条数（整个文本无标题行，或位于第一个标题行之前的单词） */
const unassignedParsedCount = computed(
  () => parseImportText(rawText.value).filter(item => item.unit === undefined).length
)

/** 可选目标单元：目标词典已有单元 + 文本中出现的单元 */
const unitOptions = computed<string[]>(() => {
  const names: string[] = []
  const dict = selectedDict.value
  if (dict) getDictUnits(dict).forEach(u => names.push(u.name))
  parseImportText(rawText.value).forEach(item => {
    if (item.unit && !names.includes(item.unit)) names.push(item.unit)
  })
  return names
})

const defaultNewUnitName = computed(() => {
  const names = new Set(unitOptions.value)
  let n = unitOptions.value.length + 1
  while (names.has(`第 ${n} 单元`)) n++
  return `第 ${n} 单元`
})

/** 把无标题词条归入用户选择的目标单元 */
function assignPendingUnit(list: ReturnType<typeof parseImportText>) {
  let pending: string | undefined
  if (unitChoice.value === '__new__') pending = newUnitName.value.trim() || defaultNewUnitName.value
  else if (unitChoice.value) pending = unitChoice.value
  if (pending) {
    list.forEach(item => {
      if (!item.unit) item.unit = pending
    })
  }
}

const selectedDict = computed<Dict | null>(() => {
  if (dictMode.value === 'new') {
    const name = newDictName.value.trim()
    return name ? getDefaultDict({ name, custom: true, system: false }) : null
  }
  return availableDicts.value.find(dict => dict.id === selectedDictId.value) ?? null
})

const selectedIsOfficial = computed(() => !!selectedDict.value && !isCustomDict(selectedDict.value))

function goStep2() {
  if (!selectedDict.value) {
    Toast.warning(dictMode.value === 'new' ? '请输入新词典名称' : '请选择要导入的词典')
    return
  }
  step.value = 2
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  fileName.value = file.name
  const reader = new FileReader()
  reader.onload = () => {
    rawText.value = String(reader.result ?? '')
  }
  reader.readAsText(file, 'utf-8')
  input.value = ''
}

function normalizeApiWord(apiData: Record<string, any>): Word {
  const relWords = apiData.relWords ?? apiData.rel_words
  return getDefaultWord({
    ...apiData,
    id: '',
    relWords: relWords ?? { root: '', rels: [] },
    synos: apiData.synos ?? [],
    etymology: apiData.etymology ?? [],
    trans: apiData.trans ?? [],
    sentences: apiData.sentences ?? [],
    phrases: apiData.phrases ?? [],
    custom: false,
  })
}

function withTimeout<T>(task: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([task, new Promise<null>(resolve => setTimeout(() => resolve(null), ms))])
}

async function queryOfficialWord(word: string): Promise<Word | null> {
  try {
    const res = await withTimeout(queryWord({ word }), 4000)
    if (res?.success && res.data) return normalizeApiWord(res.data as Record<string, any>)
  } catch {
    /* 官方词库不可用时走在线词典兜底 */
  }
  return null
}

/** 本地部署没有官方词库接口，用服务端 /api/word 代理在线词典补全音标、释义、例句 */
async function queryOnlineWord(word: string): Promise<Word | null> {
  try {
    const res = await $fetch<{ ok: boolean; word?: Record<string, any> }>('/api/word', {
      params: { word },
      timeout: 8000,
    })
    if (res?.ok && res.word) return normalizeApiWord(res.word)
  } catch {
    /* 在线词典不可用时走翻译兜底 */
  }
  return null
}

async function translateWord(word: string): Promise<string> {
  try {
    const res = await $fetch<{ ok: boolean; trans?: string }>('/api/translate', {
      params: { text: word },
      timeout: 6000,
    })
    return res?.ok && res.trans ? res.trans : ''
  } catch {
    return ''
  }
}

async function startImport() {
  if (running.value) return
  const list = parseImportText(rawText.value)
  if (!list.length) {
    Toast.warning('请输入要导入的单词')
    return
  }
  let target = selectedDict.value
  if (!target) {
    Toast.warning('请选择要导入的词典')
    step.value = 1
    return
  }
  if (!isCustomDict(target) && !(target.words ?? []).length) {
    try {
      target = await _getDictDataByUrl(target)
    } catch {
      /* 资源拉取失败时按内存中的词数处理 */
    }
  }

  running.value = true
  step.value = 3
  assignPendingUnit(list)
  importedUnitCount.value = new Set(list.map(item => item.unit).filter(v => v !== undefined)).size
  officialCount.value = 0
  dictCount.value = 0
  manualCount.value = 0
  skippedCount.value = 0
  unitMovedCount.value = 0
  translatedCount.value = 0
  failedRows.value = []

  const existingWords = new Map<string, Word>()
  ;(target.words ?? []).forEach((word: Word) => existingWords.set(normalizeKey(word.word), word))
  const existingKeys = new Set(existingWords.keys())
  const addedWords: Word[] = []

  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    const key = normalizeKey(item.word)
    progressText.value = `正在处理 ${i + 1}/${list.length}：${item.word}`

    if (existingKeys.has(key)) {
      //已存在的单词：若导入指定的单元与当前单元不同，则变更其单元而不是跳过
      const existing = existingWords.get(key)
      const currentUnit = typeof existing?.unit === 'string' ? existing.unit.trim() : undefined
      if (existing && item.unit && currentUnit !== item.unit) {
        existing.unit = item.unit
        unitMovedCount.value++
      } else {
        skippedCount.value++
      }
      continue
    }

    // 文本里自带释义（如「单词」下一行中文）时直接采用，不请求词典和翻译
    const manualTrans = item.trans?.trim() || ''
    if (manualTrans) {
      addedWords.push(
        getDefaultWord({
          word: item.word,
          custom: true,
          trans: [{ pos: '', cn: manualTrans }],
          unit: item.unit,
        })
      )
      existingKeys.add(key)
      manualCount.value++
      continue
    }

    const official = await queryOfficialWord(item.word)
    if (official) {
      official.id = getDefaultWord().id
      if (item.unit) official.unit = item.unit
      addedWords.push(official)
      existingKeys.add(key)
      officialCount.value++
      continue
    }

    const online = await queryOnlineWord(item.word)
    if (online) {
      online.id = getDefaultWord().id
      if (item.unit) online.unit = item.unit
      addedWords.push(online)
      existingKeys.add(key)
      dictCount.value++
      continue
    }

    const trans = await translateWord(item.word)

    if (trans) {
      addedWords.push(
        getDefaultWord({
          word: item.word,
          custom: true,
          trans: [{ pos: '', cn: trans }],
          unit: item.unit,
        })
      )
      existingKeys.add(key)
      translatedCount.value++
    } else {
      failedRows.value.push({ id: key, word: item.word, checked: false, editing: false })
    }
    await new Promise(resolve => setTimeout(resolve, 120))
  }

  progressText.value = ''
  running.value = false
  commitWords(addedWords, target)
}

function saveWordsIntoDict(words: Word[], target: Dict) {
  if (!words.length && !unitMovedCount.value) {
    Toast.warning('没有可导入的单词')
    return
  }
  const merged: Dict = getDefaultDict({
    ...target,
    id: target.id || `custom-dict-${Date.now()}`,
    words: [...(target.words ?? []), ...words],
    //单词结构变化后需要按新单元重新折算进度
    unitProgressInitialized: false,
  })
  merged.length = merged.words.length

  const next = isCustomDict(target) ? merged : ensureCustomDictCopy(merged)
  //target 可能没有 id（历史数据），按引用或 id 匹配，避免重复推送新词条目
  const index = base.word.bookList.findIndex(item => item === target || (!!target.id && item.id === target.id))

  _nextTick(() => {
    if (index > -1) base.word.bookList[index] = getDefaultDict(next)
    else base.word.bookList.push(getDefaultDict(next))
    runtimeStore.editDict = getDefaultDict(next)
  }, 100)

  if (words.length) Toast.success(`已导入 ${words.length} 个单词`)
  else Toast.success(`已变更 ${unitMovedCount.value} 个单词的单元`)
}

function commitWords(words: Word[], target: Dict) {
  saveWordsIntoDict(words, target)
}

function downloadFailedList() {
  if (!failedRows.value.length) {
    Toast.warning('没有失败单词')
    return
  }
  const rows = ['单词,释义', ...failedRows.value.map(row => `${row.word},`)]
  const csv = '\uFEFF' + rows.join('\n')
  saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), '失败单词列表.csv')
}

function retryImport() {
  if (!failedRows.value.length) {
    Toast.warning('没有失败单词')
    return
  }
  rawText.value = failedRows.value.map(row => row.word).join('\n')
  failedRows.value = []
  step.value = 2
}

function importBlankWords() {
  const target = selectedDict.value
  if (!target) {
    Toast.warning('请选择要导入的词典')
    step.value = 1
    return
  }
  const rows = failedRows.value
  if (!rows.length) return

  const words = rows.map(row => getDefaultWord({ word: row.word, custom: true }))
  saveWordsIntoDict(words, target)

  failedRows.value = []
  Toast.success(`已导入 ${words.length} 个空白单词`)
  nav('/dict')
}

function abandon() {
  nav('/words')
}

function goBack() {
  if (step.value === 1) nav('/dict-list')
  else step.value = step.value - 1
}
</script>

<template>
  <BasePage>
    <div class="card import-page">
      <div class="flex items-center relative gap-2 header-section">
        <BackIcon class="z-2" @click="goBack" />
        <span class="page-title absolute w-full center">导入单词</span>
      </div>

      <div class="steps">
        <div class="step-item" :class="{ active: step === 1, done: step > 1 }">1 选择词典</div>
        <div class="step-line" :class="{ done: step > 1 }" />
        <div class="step-item" :class="{ active: step === 2, done: step > 2 }">2 导入单词</div>
        <div class="step-line" :class="{ done: step > 2 }" />
        <div class="step-item" :class="{ active: step === 3 }">3 导入结果</div>
      </div>

      <!-- 步骤 1 -->
      <div v-if="step === 1" class="step-body">
        <div class="section-title">选择要导入的目标词典</div>
        <div class="dict-mode">
          <BaseButton :type="dictMode === 'existing' ? 'primary' : 'info'" size="small" @click="dictMode = 'existing'">
            现有自定义词典
          </BaseButton>
          <BaseButton :type="dictMode === 'new' ? 'primary' : 'info'" size="small" @click="dictMode = 'new'">
            新建词典
          </BaseButton>
        </div>

        <div v-if="dictMode === 'existing'" class="dict-list">
          <p v-if="loadingDicts" class="tip">正在加载词典…</p>
          <template v-else>
            <button
              v-for="dict in availableDicts"
              :key="dict.id"
              type="button"
              class="dict-item"
              :class="{ selected: selectedDictId === dict.id }"
              @click="selectedDictId = dict.id"
            >
              <span class="dict-name">{{ dict.name }}</span>
              <span class="dict-meta">
                <span class="dict-badge">{{ isCustomDict(dict) ? '个人' : '官方' }}</span>
                <span class="dict-count">{{ (dict.words || []).length }} 词</span>
              </span>
            </button>
            <p v-if="!availableDicts.length" class="tip">
              暂无词典，可切换到「新建词典」，或先去词典列表添加词典。
            </p>
            <p v-if="selectedIsOfficial" class="tip">
              官方词典导入后会另建一份个人副本，不影响原词典。
            </p>
          </template>
        </div>

        <div v-else class="dict-list">
          <BaseInput v-model="newDictName" placeholder="请输入新词典名称" />
        </div>

        <div class="step-footer">
          <BaseButton type="info" @click="goBack">返回</BaseButton>
          <BaseButton @click="goStep2">下一步</BaseButton>
        </div>
      </div>

      <!-- 步骤 2 -->
      <div v-else-if="step === 2" class="step-body">
        <div class="section-title">粘贴或选择单词列表</div>
        <p class="tip">
          每行一个单词；支持「单词,释义」「单词:= 释义」，lead|led|led 这类用 | 分隔的词形，
          以及「单词」一行、「中文释义」下一行的两行写法（这种情况直接使用该释义，不再请求词典或翻译）。
        </p>
        <Textarea v-model="rawText" :rows="10" :autosize="false" placeholder="e-payment&#10;电子支付，电子付款&#10;Kenyan&#10;肯尼亚人&#10;the Olympics:= 奥林匹克运动会&#10;lead|led|led" />
        <div class="file-row">
          <label class="file-label">
            选择 txt / csv 文件
            <input type="file" accept=".txt,.csv" class="file-input" @change="onFileChange" />
          </label>
          <span class="tip" v-if="fileName">已读取：{{ fileName }}</span>
          <span class="tip">解析到 {{ parsedCount }} 条</span>
          <span class="tip" v-if="parsedUnitCount">识别到 {{ parsedUnitCount }} 个单元</span>
        </div>
        <div v-if="unassignedParsedCount" class="unit-ask">
          <span class="tip">
            有 {{ unassignedParsedCount }} 个词条没有单元标题（未指定单元或位于第一个单元标题之前），请选择它们要加入的单元：
          </span>
          <div class="unit-ask-row">
            <select v-model="unitChoice" class="unit-select">
              <option value="__new__">新建单元</option>
              <option value="">不分配单元</option>
              <option v-for="name in unitOptions" :key="name" :value="name">{{ name }}</option>
            </select>
            <BaseInput
              v-if="unitChoice === '__new__'"
              v-model="newUnitName"
              :placeholder="`单元名字（留空则为 ${defaultNewUnitName}）`"
              class="flex-1"
            />
          </div>
        </div>
        <div class="step-footer">
          <BaseButton type="info" @click="step = 1">返回上一步</BaseButton>
          <BaseButton :disabled="running || !parsedCount" @click="startImport">开始导入</BaseButton>
        </div>
      </div>

      <!-- 步骤 3 -->
      <div v-else class="step-body">
        <div class="section-title">导入结果</div>
        <div class="result-box">
          <p class="result-title">导入完成</p>
          <ul class="result-list">
            <li>采用文本自带释义 {{ manualCount }} 个（未请求词典与翻译）</li>
            <li>官方词库匹配 {{ officialCount }} 个（含音标、释义、例句）</li>
            <li>在线词典词条 {{ dictCount }} 个（含音标、释义，官方词库未收录时自动补全）</li>
            <li>仅自动翻译导入 {{ translatedCount }} 个</li>
            <li>跳过 {{ skippedCount }} 个（词典中已存在且单元相同）</li>
            <li v-if="unitMovedCount">变更了 {{ unitMovedCount }} 个单词单元（词典中已存在但所在单元与导入不同）</li>
            <li v-if="importedUnitCount">识别到 {{ importedUnitCount }} 个单元（按 Unit / 第N单元 标题分组）</li>
            <li v-if="failedRows.length">
              {{ failedRows.length }} 个未导入
              <ul class="result-sub">
                <li>可在下方表格修改拼写后再次导入</li>
                <li>可点击「下载失败列表」填写翻译后重新上传</li>
              </ul>
            </li>
          </ul>
          <p class="tip" v-if="progressText">{{ progressText }}</p>
        </div>

        <WordFailedTable v-if="failedRows.length" v-model:rows="failedRows" />

        <div class="step-footer wrap">
          <BaseButton type="info" @click="goBack">返回上一步</BaseButton>
          <div class="footer-right">
            <BaseButton type="info" :disabled="!failedRows.length" @click="downloadFailedList">下载失败列表</BaseButton>
            <BaseButton type="info" :disabled="!failedRows.length" @click="retryImport">再次导入</BaseButton>
            <BaseButton type="info" @click="abandon">放弃导入</BaseButton>
            <BaseButton type="info" :disabled="!failedRows.length" @click="importBlankWords">直接导入空白单词</BaseButton>
          </div>
        </div>
      </div>
    </div>
  </BasePage>
</template>

<style scoped lang="scss">
.import-page {
  padding: 0.75rem 1rem 1.25rem;
}

.steps {
  align-items: center;
  display: flex;
  gap: 0.5rem;
  margin: 1.25rem 0 1rem;
}

.step-item {
  color: var(--md-sys-color-on-surface-variant);
  font-size: 0.9rem;
  white-space: nowrap;
  padding: 0.25rem 0.75rem;
  border-radius: var(--md-sys-shape-full);

  &.active {
    color: var(--md-sys-color-on-secondary-container);
    background: var(--md-sys-color-secondary-container);
    font-weight: 600;
  }

  &.done {
    color: var(--md-sys-color-primary);
  }
}

.step-line {
  background: var(--md-sys-color-outline-variant);
  flex: 1;
  height: 1px;

  &.done {
    background: var(--md-sys-color-primary);
  }
}

.step-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.section-title {
  font-size: 1rem;
  font-weight: 700;
}

.tip {
  color: var(--color-font-3);
  font-size: 0.85rem;
  line-height: 1.6;
  margin: 0;
}

.dict-mode {
  display: flex;
  gap: 0.5rem;
}

.dict-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-height: 20rem;
  overflow: auto;
}

.dict-item {
  align-items: center;
  background: var(--md-sys-color-surface-container-low);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-md);
  color: var(--md-sys-color-on-surface);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  padding: 0.6rem 0.85rem;
  text-align: left;
  transition: background-color 0.2s ease, border-color 0.2s ease;

  &.selected {
    border-color: var(--md-sys-color-primary);
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
  }

  &:hover {
    background: var(--md-sys-color-surface-container-high);
  }
}

.dict-meta {
  align-items: center;
  display: flex;
  gap: 0.5rem;
}

.dict-badge {
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-full);
  color: var(--md-sys-color-on-surface-variant);
  font-size: 0.75rem;
  padding: 0 0.45rem;
}

.dict-count {
  color: var(--md-sys-color-on-surface-variant);
  font-size: 0.85rem;
}

.file-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.unit-ask {
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-md);
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: var(--md-sys-color-surface-container-low);
}

.unit-ask-row {
  align-items: center;
  display: flex;
  gap: 0.75rem;
}

.unit-select {
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-md);
  background: var(--md-sys-color-surface-container-low);
  color: var(--md-sys-color-on-surface);
  padding: 0.45rem 0.6rem;
  outline: none;

  &:focus {
    border-color: var(--md-sys-color-primary);
  }
}

.file-label {
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-full);
  cursor: pointer;
  font-size: 0.88rem;
  padding: 0.45rem 0.9rem;
}

.file-input {
  display: none;
}

.result-box {
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-lg);
  background: var(--md-sys-color-surface-container-low);
  padding: 1rem 1.15rem;
}

.result-title {
  font-weight: 700;
  margin: 0 0 0.5rem;
}

.result-list {
  color: var(--color-font-2);
  font-size: 0.9rem;
  line-height: 1.9;
  margin: 0;
  padding-left: 1.1rem;
}

.result-sub {
  color: var(--color-font-3);
  font-size: 0.85rem;
}

.step-footer {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.5rem;

  &.wrap {
    flex-wrap: wrap;
  }
}

.footer-right {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
