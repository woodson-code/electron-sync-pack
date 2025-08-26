import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { PackExecutor } from './PackExecutor'
import { FileTransfer } from './FileTransfer'
import { NetworkManager } from '../network/NetworkManager'
import { join } from 'path'
import { ensureDir, remove } from 'fs-extra'

export interface TaskConfig {
  repoUrl: string
  branch: string
  platforms: string[]
  outputDir: string
  buildScript?: string
  installScript?: string
  env?: Record<string, string>
  upload?: {
    host: string
    port?: number
    username: string
    password?: string
    privateKey?: string
    targetDir: string
  }
  copyLocal?: boolean
}

export interface TaskResult {
  outputPath: string
  platform: string
  size: number
  buildTime: number
}

export interface Task {
  id: string
  config: TaskConfig
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
  result: TaskResult[] | null
  error: string | null
  progress: number
  logs: string[]
  assignedNode?: string
}

export interface TaskProgress {
  taskId: string
  progress: number
  log: string
}

export class TaskManager extends EventEmitter {
  private tasks: Map<string, Task> = new Map()
  private packExecutor: PackExecutor
  private fileTransfer: FileTransfer
  private networkManager: NetworkManager | null = null

  constructor() {
    super()
    this.packExecutor = new PackExecutor()
    this.fileTransfer = new FileTransfer()
  }

  setNetworkManager(networkManager: NetworkManager): void {
    this.networkManager = networkManager
    
    // 监听网络事件
    this.networkManager.on('pack-task', (taskData: { taskId: string; config: TaskConfig }) => {
      this.executePackTask(taskData)
    })
  }

  async createPackTask(taskConfig: TaskConfig): Promise<string> {
    const taskId = randomUUID()
    const task: Task = {
      id: taskId,
      config: taskConfig,
      status: 'pending',
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      progress: 0,
      logs: []
    }

    this.tasks.set(taskId, task)

    // 如果是服务器模式，广播任务到所有节点
    if (this.networkManager && this.networkManager.isServerMode()) {
      this.networkManager.broadcastToAll({
        type: 'pack-task',
        data: {
          taskId,
          config: taskConfig
        }
      })
    }

    this.emit('task-created', task)
    return taskId
  }

  async executePackTask(taskData: { taskId: string; config: TaskConfig }): Promise<void> {
    const { taskId } = taskData
    const config: TaskConfig = { ...taskData.config }
    
    // 创建本地任务记录
    const task: Task = {
      id: taskId,
      config: config,
      status: 'running',
      createdAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
      result: null,
      error: null,
      progress: 0,
      logs: []
    }

    this.tasks.set(taskId, task)
    this.emit('task-started', task)

    try {
      // 工作节点不做本地复制，直接上传
      if (this.networkManager && !this.networkManager.isServerMode()) {
        config.copyLocal = false
      }
      // 执行打包任务
      const result = await this.packExecutor.execute(config, (progress: number, log: string) => {
        task.progress = progress
        task.logs.push(log)
        this.emit('task-progress', { taskId, progress, log })
      })

      task.status = 'completed'
      task.completedAt = new Date()
      task.result = result
      task.progress = 100

      this.emit('task-completed', task)

      // 如果是工作节点，上传结果到服务器
      if (this.networkManager && !this.networkManager.isServerMode()) {
        await this.uploadResult(task)
      }

    } catch (error) {
      task.status = 'failed'
      task.completedAt = new Date()
      task.error = (error as Error).message
      
      this.emit('task-failed', task)
    }
  }

  private async uploadResult(task: Task): Promise<void> {
    try {
      if (!task.result || task.result.length === 0) return

      for (const result of task.result) {
        const fileName = `${task.id}_${result.platform}.zip`

        // 创建临时压缩包
        const tempDir = join(process.cwd(), 'temp')
        const tempZipPath = join(tempDir, fileName)
        await ensureDir(tempDir)

        // 压缩结果文件
        await this.fileTransfer.compressFile(result.outputPath, tempZipPath)

        // 通过 WebSocket 分片上传到服务器，包含任务配置信息
        if (this.networkManager) {
          await this.networkManager.uploadFileToServer(tempZipPath, {
            uploadId: `${task.id}-${result.platform}`,
            fileName,
            subDir: task.id,
            taskConfig: task.config // 传递任务配置，包含输出目录信息
          })
        }

        // 清理临时文件
        await remove(tempZipPath)
      }
      
    } catch (error) {
      console.error('上传结果失败:', error)
    }
  }

  getTaskStatus(taskId: string): Task | null {
    return this.tasks.get(taskId) || null
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values())
  }

  getTasksByStatus(status: Task['status']): Task[] {
    return Array.from(this.tasks.values()).filter(task => task.status === status)
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId)
    if (task && task.status === 'running') {
      await this.packExecutor.cancel(taskId)
      task.status = 'cancelled'
      task.completedAt = new Date()
      this.emit('task-cancelled', task)
      return true
    }
    return false
  }

  clearCompletedTasks(): void {
    const completedTasks = this.getTasksByStatus('completed')
    completedTasks.forEach(task => {
      this.tasks.delete(task.id)
    })
  }

  getTaskLogs(taskId: string): string[] {
    const task = this.tasks.get(taskId)
    return task ? task.logs : []
  }

  updateTaskProgress(taskId: string, progress: number, log: string): void {
    const task = this.tasks.get(taskId)
    if (task) {
      task.progress = progress
      task.logs.push(log)
      this.emit('task-progress', { taskId, progress, log })
    }
  }
}
