import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { NetworkManager } from './network/NetworkManager'
import { TaskManager, TaskConfig } from './task/TaskManager'
import { ConfigManager } from './config/ConfigManager'

class ElectronSyncPack {
  private mainWindow: BrowserWindow | null = null
  private networkManager: NetworkManager
  private taskManager: TaskManager
  private configManager: ConfigManager

  constructor() {
    this.networkManager = new NetworkManager()
    this.taskManager = new TaskManager()
    this.configManager = new ConfigManager()

    this.init()
  }

  private init(): void {
    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
    app.whenReady().then(() => {
      // Set app user model id for windows
      electronApp.setAppUserModelId('com.cmict.om.syncpack')

      // Default open or close DevTools.
      // FIXME: Don't open DevTools in production.
      // if (is.dev && process.platform === 'darwin') {
      //   app.on('activate', function () {
      //     On macOS it's common to re-create a window in the app when the
      //     dock icon is clicked and there are no other windows open.
      //     if (BrowserWindow.getAllWindows().length === 0) createWindow()
      //   })
      // }

      // IPC test
      ipcMain.handle('ping', () => 'pong')

      this.createWindow()
      this.setupIPC()
      this.setupEventListeners()
    })

    app.on('window-all-closed', () => {
      // On macOS it is common for applications and their menu bar
      // to stay active until the user quits explicitly with Cmd + Q
      if (process.platform !== 'darwin') {
        app.quit()
      }
    })

    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow()
      }
    })

    // Quit when all windows are closed, except on macOS. There, it's common
    // for applications and their menu bar to stay active until the user quits
    // explicitly with Cmd + Q.
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit()
      }
    })

    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow()
      }
    })

    // In this file you can include the rest of your app's specific main process
    // code. You can also put them in separate files and import them here.
  }

  private createWindow(): void {
    // Create the browser window.
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      show: false,
      autoHideMenuBar: true,
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        nodeIntegration: true
      }
    })
    this.networkManager.setupMainWindow(this.mainWindow)

    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.show()
      if (is.dev) {
        this.mainWindow?.webContents.openDevTools({ mode: 'detach' })
      }
    })

    this.mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      this.mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
  }

  private setupIPC(): void {
    // 网络相关
    ipcMain.handle('network:start-server', async (_, port: number) => {
      return await this.networkManager.startServer(port)
    })

    ipcMain.handle('network:stop-server', async () => {
      return await this.networkManager.stopServer()
    })

    ipcMain.handle('network:switch-task-on', async () => {
      this.taskManager.setNetworkManager(this.networkManager)
      return Promise.resolve(true)
    })

    ipcMain.handle('network:connect-to-server', async (_, host: string, port: number) => {
      return await this.networkManager.connectToServer(host, port)
    })

    ipcMain.handle('network:disconnect-to-server', async () => {
      return await this.networkManager.disconnectToServer()
    })

    ipcMain.handle('network:get-connected-nodes', () => {
      return this.networkManager.getConnectedNodes()
    })

    ipcMain.handle('network:get-node-info', () => {
      return this.networkManager.getNodeInfo()
    })

    // 任务相关
    ipcMain.handle('task:create-pack-task', async (_, taskConfig: TaskConfig) => {
      return await this.taskManager.createPackTask(taskConfig)
    })

    ipcMain.handle('task:get-task-status', async (_, taskId: string) => {
      return await this.taskManager.getTaskStatus(taskId)
    })

    ipcMain.handle('task:get-all-tasks', () => {
      return this.taskManager.getAllTasks()
    })

    ipcMain.handle('task:cancel-task', async (_, taskId: string) => {
      return await this.taskManager.cancelTask(taskId)
    })

    // 配置相关
    ipcMain.handle('config:save', async (_, config: Record<string, unknown>) => {
      return await this.configManager.saveConfig(config)
    })

    ipcMain.handle('config:load', () => {
      return this.configManager.loadConfig()
    })
  }

  private setupEventListeners(): void {
    // 监听网络事件
    this.networkManager.on('node-connected', (nodeInfo) => {
      this.mainWindow?.webContents.send('network:node-connected', nodeInfo)
    })

    this.networkManager.on('node-disconnected', (nodeInfo) => {
      this.mainWindow?.webContents.send('network:node-disconnected', nodeInfo)
    })

    // 监听文件上传完成事件
    this.networkManager.on('file-upload-completed', async (data: { uploadId: string; targetPath: string; taskConfig?: TaskConfig }) => {
      await this.handleFileUploadCompleted(data)
    })

    // 监听任务事件
    this.taskManager.on('task-started', (taskInfo) => {
      this.mainWindow?.webContents.send('task:started', taskInfo)
    })

    this.taskManager.on('task-completed', (taskInfo) => {
      this.mainWindow?.webContents.send('task:completed', taskInfo)
    })

    this.taskManager.on('task-failed', (taskInfo) => {
      this.mainWindow?.webContents.send('task:failed', taskInfo)
    })

    this.taskManager.on('task-progress', (taskInfo) => {
      this.mainWindow?.webContents.send('task:progress', taskInfo)
    })
  }

  private async handleFileUploadCompleted(data: { uploadId: string; targetPath: string; taskConfig?: TaskConfig }): Promise<void> {
    try {
      const { targetPath, taskConfig } = data
      
      // 如果有任务配置且包含输出目录，则移动文件到指定目录
      if (taskConfig && taskConfig.outputDir) {
        const fs = await import('fs-extra')
        const path = await import('path')
        
        // 确保目标目录存在
        await fs.ensureDir(taskConfig.outputDir)
        
        // 获取文件名
        const fileName = path.basename(targetPath)
        const targetFilePath = path.join(taskConfig.outputDir, fileName)
        
        // 移动文件到指定目录
        await fs.move(targetPath, targetFilePath, { overwrite: true })
        
        console.log(`文件已移动到指定目录: ${targetFilePath}`)
        
        // 通知渲染进程文件移动完成
        this.mainWindow?.webContents.send('file:moved-to-output-dir', {
          originalPath: targetPath,
          targetPath: targetFilePath,
          outputDir: taskConfig.outputDir
        })
      } else {
        console.log(`文件上传完成，保存在: ${targetPath}`)
      }
    } catch (error) {
      console.error('处理文件上传完成事件失败:', error)
    }
  }
}

// 启动应用
new ElectronSyncPack()
