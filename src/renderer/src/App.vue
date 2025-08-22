<template>
  <div class="app">
    <header class="app-header">
      <h1>Electron Sync Pack</h1>
      <div class="subtitle">分布式 Electron 跨平台打包</div>
    </header>

    <main class="content">
      <section class="panel">
        <NetworkPanel />
      </section>

      <section class="panel">
        <TaskPanel />
      </section>

      <section class="panel">
        <TaskList />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import NetworkPanel from './components/NetworkPanel.vue'
import TaskPanel from './components/TaskPanel.vue'
import TaskList from './components/TaskList.vue'
import { useNetworkStore } from '@renderer/store/network'
import { onBeforeUnmount, onMounted } from 'vue'

const networkStore = useNetworkStore()
onMounted(() => {
  networkStore.initOn()
})
onBeforeUnmount(() => {
  networkStore.initOff()
})
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.app-header {
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
}
.subtitle {
  color: #888;
  font-size: 12px;
}
.content {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  padding: 12px;
  overflow: auto;
}
.panel {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 12px;
}
</style>
