import { readFile, writeFile, ensureDir } from 'fs-extra'
import { join } from 'path'

export interface AppConfig {
  network: {
    defaultPort: number
    autoConnect: boolean
    serverHost: string
  }
  build: {
    defaultOutputDir: string
    workspaceDir: string
    keepWorkspace: boolean
  }
  git: {
    defaultBranch: string
    credentials: {
      username?: string
      token?: string
    }
  }
  ui: {
    theme: 'light' | 'dark'
    language: 'zh-CN' | 'en-US'
  }
}

export class ConfigManager {
  private configPath: string
  private defaultConfig: AppConfig = {
    network: {
      defaultPort: 3000,
      autoConnect: false,
      serverHost: 'localhost'
    },
    build: {
      defaultOutputDir: join(process.cwd(), 'outputs'),
      workspaceDir: join(process.cwd(), 'workspace'),
      keepWorkspace: false
    },
    git: {
      defaultBranch: 'main',
      credentials: {}
    },
    ui: {
      theme: 'light',
      language: 'zh-CN'
    }
  }

  constructor() {
    this.configPath = join(process.cwd(), 'config', 'app.json')
  }

  async loadConfig(): Promise<AppConfig> {
    try {
      await ensureDir(join(process.cwd(), 'config'))
      const configData = await readFile(this.configPath, 'utf-8')
      const config = JSON.parse(configData)
      
      // 合并默认配置，确保所有字段都存在
      return this.mergeConfig(this.defaultConfig, config)
    } catch (error) {
      // 如果配置文件不存在或读取失败，返回默认配置
      console.log('使用默认配置')
      return this.defaultConfig
    }
  }

  async saveConfig(config: Partial<AppConfig>): Promise<void> {
    try {
      await ensureDir(join(process.cwd(), 'config'))
      const currentConfig = await this.loadConfig()
      const mergedConfig = this.mergeConfig(currentConfig, config)
      
      await writeFile(this.configPath, JSON.stringify(mergedConfig, null, 2), 'utf-8')
    } catch (error) {
      throw new Error(`保存配置失败: ${(error as Error).message}`)
    }
  }

  async updateConfig(updates: Partial<AppConfig>): Promise<void> {
    const currentConfig = await this.loadConfig()
    const newConfig = this.mergeConfig(currentConfig, updates)
    await this.saveConfig(newConfig)
  }

  private mergeConfig(defaultConfig: AppConfig, userConfig: Partial<AppConfig>): AppConfig {
    const merged = { ...defaultConfig }
    
    if (userConfig.network) {
      merged.network = { ...merged.network, ...userConfig.network }
    }
    
    if (userConfig.build) {
      merged.build = { ...merged.build, ...userConfig.build }
    }
    
    if (userConfig.git) {
      merged.git = { ...merged.git, ...userConfig.git }
      if (userConfig.git.credentials) {
        merged.git.credentials = { ...merged.git.credentials, ...userConfig.git.credentials }
      }
    }
    
    if (userConfig.ui) {
      merged.ui = { ...merged.ui, ...userConfig.ui }
    }
    
    return merged
  }

  getDefaultConfig(): AppConfig {
    return { ...this.defaultConfig }
  }

  async resetConfig(): Promise<void> {
    await this.saveConfig(this.defaultConfig)
  }
}
