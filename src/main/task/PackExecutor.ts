import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { ensureDir, remove, copy, stat } from 'fs-extra'
import { simpleGit, SimpleGit } from 'simple-git'
import { TaskConfig, TaskResult } from './TaskManager'

export class PackExecutor {
  private runningTasks: Map<string, ChildProcess> = new Map()
  private git: SimpleGit

  constructor() {
    this.git = simpleGit()
  }

  async execute(
    config: TaskConfig,
    progressCallback: (progress: number, log: string) => void
  ): Promise<TaskResult[]> {
    const taskId = this.generateTaskId()
    const workDir = join(process.cwd(), 'workspace', taskId)

    try {
      await ensureDir(workDir)
      progressCallback(5, '创建工作目录完成')

      // 1. 克隆代码
      progressCallback(10, '开始克隆代码...')
      await this.cloneRepository(config.repoUrl, workDir)
      progressCallback(20, '代码克隆完成')

      // 2. 切换分支
      progressCallback(25, '切换分支...')
      await this.checkoutBranch(workDir, config.branch)
      progressCallback(30, '分支切换完成')

      // 3. 安装依赖
      progressCallback(35, '安装依赖...')
      await this.installDependencies(workDir, config.installScript, progressCallback)
      progressCallback(60, '依赖安装完成')

      // 4. 执行打包
      const results: TaskResult[] = []
      const totalPlatforms = config.platforms.length

      for (let i = 0; i < config.platforms.length; i++) {
        const platform = config.platforms[i]
        const platformProgress = 60 + (i / totalPlatforms) * 35

        progressCallback(platformProgress, `开始打包 ${platform} 平台...`)

        const result = await this.buildForPlatform(workDir, platform, config, progressCallback)
        results.push(result)

        progressCallback(platformProgress + 35 / totalPlatforms, `${platform} 平台打包完成`)
      }

      // 5. 复制结果到输出目录
      progressCallback(95, '复制打包结果...')
      await this.copyResults(results, config.outputDir)
      progressCallback(100, '打包任务完成')

      return results
    } catch (error) {
      throw new Error(`打包执行失败: ${(error as Error).message}`)
    } finally {
      // 清理工作目录
      try {
        await remove(workDir)
      } catch (error) {
        console.error('清理工作目录失败:', error)
      }
    }
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private async cloneRepository(repoUrl: string, workDir: string): Promise<void> {
    try {
      await this.git.clone(repoUrl, workDir)
    } catch (error) {
      throw new Error(`克隆仓库失败: ${(error as Error).message}`)
    }
  }

  private async checkoutBranch(workDir: string, branch: string): Promise<void> {
    try {
      const git = simpleGit(workDir)
      await git.checkout(branch)
    } catch (error) {
      throw new Error(`切换分支失败: ${(error as Error).message}`)
    }
  }

  private async installDependencies(
    workDir: string,
    installScript: string = 'npm install',
    progressCallback: (progress: number, log: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const [command, ...args] = installScript.split(' ')
      const child = spawn(command, args, {
        cwd: workDir,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      child.stdout?.on('data', (data) => {
        progressCallback(40, `安装依赖: ${data.toString().trim()}`)
      })

      child.stderr?.on('data', (data) => {
        progressCallback(45, `安装警告: ${data.toString().trim()}`)
      })

      child.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`依赖安装失败，退出码: ${code}`))
        }
      })

      child.on('error', (error) => {
        reject(new Error(`依赖安装错误: ${error.message}`))
      })
    })
  }

  private async buildForPlatform(
    workDir: string,
    platform: string,
    config: TaskConfig,
    progressCallback: (progress: number, log: string) => void
  ): Promise<TaskResult> {
    const startTime = Date.now()

    return new Promise((resolve, reject) => {
      const buildScript = config.buildScript || 'npm run build'
      const [command, ...args] = buildScript.split(' ')

      // 设置环境变量
      const env = {
        ...process.env,
        ...config.env,
        ELECTRON_PLATFORM: platform
      }

      const child = spawn(command, args, {
        cwd: workDir,
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      child.stdout?.on('data', (data) => {
        progressCallback(65, `构建输出: ${data.toString().trim()}`)
      })

      child.stderr?.on('data', (data) => {
        progressCallback(70, `构建警告: ${data.toString().trim()}`)
      })

      child.on('close', async (code) => {
        if (code === 0) {
          try {
            // 查找构建输出文件
            const outputPath = await this.findBuildOutput(workDir, platform)
            const stats = await stat(outputPath)

            const result: TaskResult = {
              outputPath,
              platform,
              size: stats.size,
              buildTime: Date.now() - startTime
            }

            resolve(result)
          } catch (error) {
            reject(new Error(`查找构建输出失败: ${(error as Error).message}`))
          }
        } else {
          reject(new Error(`构建失败，退出码: ${code}`))
        }
      })

      child.on('error', (error) => {
        reject(new Error(`构建错误: ${error.message}`))
      })
    })
  }

  private async findBuildOutput(workDir: string, platform: string): Promise<string> {
    // 轮询等待产物生成，避免 electron-builder 日志已输出但文件尚未落盘
    const possibleRoots = [join(workDir, 'dist')]
    const maxAttempts = 120 // 最长等待约 2 分钟（120 * 1000ms）
    const waitMs = 1000

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      for (const root of possibleRoots) {
        const artifacts = await this.findPlatformArtifactsRecursively(root, platform)
        if (artifacts.length > 0) {
          return artifacts[0]
        }
      }
      await this.sleep(waitMs)
    }

    throw new Error(`未找到 ${platform} 平台的构建输出文件（超时）`)
  }

  private async findPlatformArtifactsRecursively(dir: string, platform: string): Promise<string[]> {
    const fs = await import('fs')
    const { readdir, stat: statAsync } = fs.promises

    const platformExtensions: Record<string, string[]> = {
      win32: ['.exe', '.msi', '.nsis'],
      darwin: ['.dmg', '.pkg', '.app'],
      linux: ['.AppImage', '.deb', '.rpm']
    }

    const wantedExts = new Set((platformExtensions[platform] || []).map((e) => e.toLowerCase()))
    const results: string[] = []

    async function walk(current: string): Promise<void> {
      try {
        const entries = await readdir(current, { withFileTypes: true })
        for (const entry of entries) {
          const full = join(current, entry.name)
          if (entry.isDirectory()) {
            await walk(full)
          } else if (entry.isFile()) {
            const lower = entry.name.toLowerCase()
            for (const ext of wantedExts) {
              if (lower.endsWith(ext)) {
                // 确认文件已存在且大小 > 0
                const s = await statAsync(full)
                if (s.size > 0) {
                  results.push(full)
                }
                break
              }
            }
          }
        }
      } catch {
        // 目录可能不存在或暂不可读，忽略并返回空结果
      }
    }

    await walk(dir)
    return results
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async copyResults(results: TaskResult[], outputDir: string): Promise<void> {
    await ensureDir(outputDir)

    for (const result of results) {
      const fileName = `build_${result.platform}_${Date.now()}${this.getFileExtension(result.outputPath)}`
      const targetPath = join(outputDir, fileName)

      await copy(result.outputPath, targetPath)
      result.outputPath = targetPath // 更新输出路径
    }
  }

  private getFileExtension(filePath: string): string {
    const ext = filePath.split('.').pop()
    return ext ? `.${ext}` : ''
  }

  async cancel(taskId: string): Promise<void> {
    const process = this.runningTasks.get(taskId)
    if (process) {
      process.kill('SIGTERM')
      this.runningTasks.delete(taskId)
    }
  }
}
