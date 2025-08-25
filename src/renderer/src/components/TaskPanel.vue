<template>
  <div class="task-panel">
    <el-form label-width="100px" label-position="left">
      <el-form-item label="仓库地址">
        <el-input v-model="form.repoUrl" placeholder="https://...git" />
      </el-form-item>
      <el-form-item label="分支">
        <el-input v-model="form.branch" placeholder="main" />
      </el-form-item>
      <el-form-item label="平台">
        <el-checkbox-group v-model="form.platforms">
          <el-checkbox label="win32">Windows</el-checkbox>
          <el-checkbox label="darwin">macOS</el-checkbox>
          <el-checkbox label="linux">Linux</el-checkbox>
        </el-checkbox-group>
      </el-form-item>
      <el-form-item label="输出目录">
        <el-input v-model="form.outputDir" placeholder="D:/builds" />
      </el-form-item>
      <el-form-item label="安装脚本">
        <el-input v-model="form.installScript" placeholder="npm install" />
      </el-form-item>
      <el-form-item label="构建脚本">
        <el-input v-model="form.buildScript" placeholder="npm run build" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="createTask" :loading="loading">创建任务</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, toRaw } from 'vue'

const loading = ref(false)

const form = reactive({
  repoUrl: '',
  branch: 'main',
  platforms: ['win32'] as string[],
  outputDir: '',
  installScript: 'npm install',
  buildScript: 'npm run build'
})

async function createTask() {
  loading.value = true
  try {
    const taskId = await window.electronAPI.task.createPackTask({ ...toRaw(form) })
    console.log('已创建任务: ', taskId)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.task-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
