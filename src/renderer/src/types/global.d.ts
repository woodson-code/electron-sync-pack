export {}

declare global {
  interface ElectronAPI {
    network: {
      startServer: (port: number) => Promise<any>
      connectToServer: (host: string, port: number) => Promise<any>
      getConnectedNodes: () => Promise<any[]>
      getNodeInfo: () => Promise<any>
    }
    task: {
      createPackTask: (taskConfig: any) => Promise<string>
      getTaskStatus: (taskId: string) => Promise<any>
      getAllTasks: () => Promise<any[]>
      cancelTask: (taskId: string) => Promise<boolean>
    }
    config: {
      save: (config: any) => Promise<void>
      load: () => Promise<any>
    }
    on: (channel: string, callback: (data: any) => void) => void
    off: (channel: string) => void
  }

  interface Window {
    electronAPI: ElectronAPI
    nodeAPI: any
  }
}
