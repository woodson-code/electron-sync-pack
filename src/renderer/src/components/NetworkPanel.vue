<template>
  <div class="network-panel">
    <el-form :inline="true" label-position="left" label-width="90px">
      <el-form-item label="模式">
        <el-segmented v-model="mode" :options="['服务器', '工作节点']" />
      </el-form-item>

      <template v-if="mode === '服务器'">
        <el-form-item label="端口">
          <el-input-number v-model="serverPort" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item>
          <template v-if="serverStatus === ServerStatus.running">
            <el-button type="danger" @click="stopServer" :loading="loading">停止服务器</el-button>
          </template>
          <template v-else>
            <el-button type="primary" @click="startServer" :loading="loading">启动服务器</el-button>
          </template>
        </el-form-item>
      </template>

      <template v-else>
        <el-form-item label="服务器">
          <el-input v-model="serverHost" placeholder="例如 192.168.1.100" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input-number v-model="serverPort" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item>
          <template v-if="serverStatus === ServerStatus.connected">
            <el-button type="danger" @click="disconnect" :loading="loading">断开连接</el-button>
          </template>
          <template v-else>
            <el-button type="primary" @click="connect" :loading="loading">连接</el-button>
          </template>
        </el-form-item>
      </template>
    </el-form>

    <el-divider />

    <el-descriptions :column="2" title="本机信息">
      <el-descriptions-item label="NodeId">{{ selfInfo?.nodeId }}</el-descriptions-item>
      <el-descriptions-item label="主机名">{{ selfInfo?.hostname }}</el-descriptions-item>
      <el-descriptions-item label="平台">{{ selfInfo?.platform }}</el-descriptions-item>
      <el-descriptions-item label="是否服务器">{{
        selfInfo?.isServer ? '是' : '否'
      }}</el-descriptions-item>
    </el-descriptions>

    <el-divider />

    <el-card shadow="never" header="已连接节点">
      <el-table :data="nodes" style="width: 100%" size="small">
        <el-table-column prop="nodeId" label="NodeId" min-width="260" />
        <el-table-column prop="hostname" label="主机名" width="180" />
        <el-table-column prop="platform" label="平台" width="120" />
        <el-table-column prop="connectedAt" label="连接时间" width="200" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useNetworkStore } from '@renderer/store/network'
import { ServerStatus } from '@shared/utils/consts'

const mode = ref<'服务器' | '工作节点'>('服务器')
const serverHost = ref('localhost')
const serverPort = ref(3000)
const nodes = ref<any[]>([])
const loading = ref(false)
const selfInfo = ref<any>()
const networkStore = useNetworkStore()
const serverStatus = computed(() => {
  return networkStore.serverStatus
})

onMounted(async () => {
  selfInfo.value = await window.electronAPI.network.getNodeInfo()
  refreshNodes()
})

async function refreshNodes() {
  try {
    nodes.value = await window.electronAPI.network.getConnectedNodes()
  } catch {}
}

async function startServer() {
  loading.value = true
  try {
    await window.electronAPI.network.startServer(serverPort.value)
    selfInfo.value = await window.electronAPI.network.getNodeInfo()
    await window.electronAPI.network.switchTaskOn()
  } finally {
    loading.value = false
    refreshNodes()
  }
}

async function stopServer() {
  loading.value = true
  try {
    await window.electronAPI.network.stopServer()
    // selfInfo.value = await window.electronAPI.network.getNodeInfo()
  } finally {
    loading.value = false
    refreshNodes()
  }
}

async function connect() {
  loading.value = true
  try {
    await window.electronAPI.network.connectToServer(serverHost.value, serverPort.value)
    await window.electronAPI.network.switchTaskOn()
  } finally {
    loading.value = false
  }
}
async function disconnect() {
  loading.value = true
  try {
    await window.electronAPI.network.disconnectToServer(serverHost.value, serverPort.value)
    await window.electronAPI.network.switchTaskOn()
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.network-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
