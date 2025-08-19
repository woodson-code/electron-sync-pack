<template>
  <div class="task-list">
    <el-card shadow="never" header="任务列表">
      <el-table :data="tasks" size="small" style="width: 100%">
        <el-table-column prop="id" label="任务ID" min-width="220" />
        <el-table-column prop="status" label="状态" width="100" />
        <el-table-column prop="progress" label="进度" width="180">
          <template #default="{ row }">
            <el-progress :percentage="row.progress" :status="row.status === 'failed' ? 'exception' : undefined" />
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="200" />
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="cancel(row.id)" :disabled="row.status !== 'running'">取消</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

const tasks = ref<any[]>([])

onMounted(async () => {
  await refresh()
  window.electronAPI.on('task:started', refresh)
  window.electronAPI.on('task:completed', refresh)
  window.electronAPI.on('task:failed', refresh)
  window.electronAPI.on('task:progress', refresh)
})

async function refresh() {
  tasks.value = await window.electronAPI.task.getAllTasks()
}

async function cancel(taskId: string) {
  await window.electronAPI.task.cancelTask(taskId)
  await refresh()
}
</script>

<style scoped>
.task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
