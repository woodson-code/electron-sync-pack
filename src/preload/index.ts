import { contextBridge, ipcRenderer } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('electronAPI', {
  // 网络相关
  network: {
    startServer: (port: number) => ipcRenderer.invoke('network:start-server', port),
    connectToServer: (host: string, port: number) => ipcRenderer.invoke('network:connect-to-server', host, port),
    getConnectedNodes: () => ipcRenderer.invoke('network:get-connected-nodes'),
    getNodeInfo: () => ipcRenderer.invoke('network:get-node-info')
  },
  
  // 任务相关
  task: {
    createPackTask: (taskConfig: any) => ipcRenderer.invoke('task:create-pack-task', taskConfig),
    getTaskStatus: (taskId: string) => ipcRenderer.invoke('task:get-task-status', taskId),
    getAllTasks: () => ipcRenderer.invoke('task:get-all-tasks'),
    cancelTask: (taskId: string) => ipcRenderer.invoke('task:cancel-task', taskId)
  },
  
  // 配置相关
  config: {
    save: (config: any) => ipcRenderer.invoke('config:save', config),
    load: () => ipcRenderer.invoke('config:load')
  },
  
  // 事件监听
  on: (channel: string, callback: Function) => {
    ipcRenderer.on(channel, (_, data) => callback(data))
  },
  
  off: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  }
})

// --------- Preload scripts are loaded before other scripts in the renderer, ---------
// --------- so you have access to node APIs here ---------

// You can expose node APIs to the renderer process here if needed
contextBridge.exposeInMainWorld('nodeAPI', {
  platform: process.platform,
  version: process.version,
  env: process.env.NODE_ENV
})
