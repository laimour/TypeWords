import { useI18n } from 'vue-i18n'

/** 名字里已经带“Unit / 单元”时不再重复加前缀 */
const HAS_UNIT_WORD = /unit|单元|單元/i

/**
 * 单元名的统一展示格式：`Unit {name}`（中文等语言走 m3e_unit_label 的本地化文案）。
 * 单元名本身（如“4”）仍用于查找/比较，只在展示时用这个包一层。
 */
export function useUnitLabel() {
  const { t } = useI18n()
  return (name?: string | null) => {
    const raw = (name ?? '').trim()
    if (!raw) return ''
    if (HAS_UNIT_WORD.test(raw)) return raw
    return t('m3e_unit_label', { name: raw })
  }
}
