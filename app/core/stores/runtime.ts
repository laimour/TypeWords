import { defineStore } from 'pinia'
import type { Dict } from '../types'
import { getDefaultDict } from '../types'

export interface RuntimeState {
  disableEventListener: boolean
  modalList: Array<{ id: string | number; close: Function }>
  editDict: Dict
  showDictModal: boolean
  excludeRoutes: any[]
  routeData: any
  isNew: boolean
  isError: boolean
  globalLoading: boolean
  /** WebDAV 云同步状态（响应式，供主页圆形按钮与设置页使用） */
  webdavStatus: 'idle' | 'syncing' | 'success' | 'error'
  /** 最近一次同步失败原因 / 状态说明 */
  webdavMessage: string
  /** 最近一次同步失败的错误分类（auth / cors / invalid-url / network / server / conflict），供 i18n 映射 */
  webdavErrorCode: string
  /** 最近一次同步成功的时间戳（毫秒） */
  webdavLastSyncAt: number
}

export const useRuntimeStore = defineStore('runtime', {
  state: (): RuntimeState => {
    return {
      routeData: null,
      disableEventListener: false,
      modalList: [],
      editDict: getDefaultDict(),
      showDictModal: false,
      excludeRoutes: [],
      isNew: false,
      isError: false,
      globalLoading: false,
      webdavStatus: 'idle',
      webdavMessage: '',
      webdavErrorCode: '',
      webdavLastSyncAt: 0,
    }
  },
  actions: {
    updateExcludeRoutes(val: any) {
      // console.log('val', val)
      if (val.type === 'add') {
        if (!this.excludeRoutes.find(v => v === val.value)) {
          this.excludeRoutes.push(val.value)
        }
      } else {
        let resIndex = this.excludeRoutes.findIndex(v => v === val.value)
        if (resIndex !== -1) {
          this.excludeRoutes.splice(resIndex, 1)
        }
      }
      // console.log('store.excludeRoutes', this.excludeRoutes)
    },
  },
})
