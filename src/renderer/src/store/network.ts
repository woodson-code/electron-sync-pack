import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import consts, { ServerStatus } from '@shared/utils/consts'

export const useNetworkStore = defineStore('network', () => {
  const networkInfo = ref({
    serverStatus: ServerStatus.stopped
  })
  function updateServerStatus(status: ServerStatus) {
    console.log(111111);
    networkInfo.value.serverStatus = status;
  }

  function initOn() {
    window.electronAPI.on(consts.Network.Channel.Server_STATUS_CHANGED,updateServerStatus)
  }

  function initOff() {
    window.electronAPI.off(consts.Network.Channel.Server_STATUS_CHANGED)
  }

  function $reset() {
    networkInfo.value = {
      serverStatus: ServerStatus.stopped
    }
  }

  const serverStatus = computed(() => networkInfo.value.serverStatus)

  return {
    networkInfo,
    serverStatus,
    initOff,
    initOn,
    $reset
  }
})
