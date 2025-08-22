import { EventEmitter } from 'events'
import WebSocket from 'ws'
import { createServer, Server } from 'http'
import { randomUUID } from 'crypto'
import { hostname } from 'os'
import { BrowserWindow } from 'electron'
import consts, { ServerStatus } from '@shared/utils/consts'

export interface NodeInfo {
  nodeId: string
  platform: string
  hostname: string
  connectedAt: Date
  isServer?: boolean
}

export interface NetworkMessage {
  type: string
  data?: any
  nodeId?: string
  platform?: string
  hostname?: string
}

export class NetworkManager extends EventEmitter {
  private server: Server | null = null
  private wss: WebSocket.Server | null = null
  private clients: Map<
    string,
    {
      id: string
      ws: WebSocket
      connectedAt: Date
      info: NodeInfo | null
    }
  > = new Map()
  private nodeId: string = randomUUID()
  private isServer: boolean = false
  private serverStatus: ServerStatus = ServerStatus.stopped
  private serverPort: number | null = null
  private clientWs: WebSocket | null = null
  private mainWindow: BrowserWindow | null = null

  constructor() {
    super()
  }
  setupMainWindow(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
  }

  // 向所有渲染进程广播状态变化
  private broadcastStatus(status: ServerStatus): void {
    this.serverStatus = status
    if (this.mainWindow) {
      // 发送变化到渲染进程
      this.mainWindow.webContents.send(
        consts.Network.Channel.Server_STATUS_CHANGED,
        this.serverStatus
      )
    }
  }

  async startServer(
    port: number = 3000
  ): Promise<{ success: boolean; port?: number; error?: string }> {
    try {
      this.server = createServer()
      this.wss = new WebSocket.Server({ server: this.server })
      // 服务启动中
      this.broadcastStatus(ServerStatus.starting)

      this.wss.on('connection', (ws: WebSocket, req) => {
        this.handleClientConnection(ws, req)
      })
      // 监听服务器关闭事件
      this.server.on('close', () => {
        this.isServer = false
        // 服务关闭
        this.broadcastStatus(ServerStatus.stopped)
        console.log('服务器已关闭')
      })

      return new Promise((resolve) => {
        this.server!.listen(port, () => {
          console.log(`服务器启动成功，端口: ${port}`)
          this.isServer = true
          this.serverPort = port
          // 服务启动运行中
          this.broadcastStatus(ServerStatus.running)
          resolve({ success: true, port })
        })
      })
    } catch (error) {
      this.broadcastStatus(ServerStatus.error)
      console.error('启动服务器失败:', error)
      return { success: false, error: (error as Error).message }
    }
  }

  // 停止服务器的方法
  async stopServer(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.server || this.serverStatus !== ServerStatus.running) {
        return { success: false, error: '服务器未在运行' }
      }

      // 关闭WebSocket服务器
      if (this.wss) {
        await new Promise((resolve, reject) => {
          this.wss!.close((err) => {
            if (err) reject(err)
            else resolve(undefined)
          })
        })
      }

      // 关闭HTTP服务器
      await new Promise((resolve, reject) => {
        this.server!.close((err) => {
          if (err) reject(err)
          else resolve(undefined)
        })
      })
      this.broadcastStatus(ServerStatus.stopped)
      return { success: true }
    } catch (error) {
      console.error('停止服务器失败:', error)
      this.broadcastStatus(ServerStatus.error)
      return { success: false, error: (error as Error).message }
    }
  }

  async connectToServer(host: string, port: number): Promise<{ success: boolean; error?: string }> {
    try {
      this.clientWs = new WebSocket(`ws://${host}:${port}`)

      return new Promise((resolve) => {
        this.clientWs!.on('open', () => {
          console.log(`已连接到服务器: ${host}:${port}`)
          this.isServer = false
          this.serverPort = port
          this.broadcastStatus(ServerStatus.connected)

          // 发送节点信息
          this.clientWs!.send(
            JSON.stringify({
              type: 'node-info',
              nodeId: this.nodeId,
              platform: process.platform,
              hostname: hostname()
            })
          )

          resolve({ success: true })
        })

        this.clientWs!.on('message', (data: WebSocket.Data) => {
          this.handleServerMessage(this.clientWs!, data)
        })

        this.clientWs!.on('close', () => {
          console.log('与服务器断开连接')
          this.broadcastStatus(ServerStatus.stopped)
          this.emit('node-disconnected', { nodeId: this.nodeId })
        })

        this.clientWs!.on('error', (error) => {
          console.error('连接错误:', error)
          this.broadcastStatus(ServerStatus.error)
          resolve({ success: false, error: error.message })
        })
      })
    } catch (error) {
      console.error('连接服务器失败:', error)
      return { success: false, error: (error as Error).message }
    }
  }

  // 停止服务器的方法
  async disconnectToServer(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.serverStatus !== ServerStatus.connected) {
        return { success: false, error: '未连接服务器' }
      }

      // 关闭WebSocket服务器
      if (this.clientWs) {
        await new Promise((resolve, reject) => {
          this.clientWs!.close((err) => {
            if (err) reject(err)
            else resolve(undefined)
          })
        })
      }
      this.broadcastStatus(ServerStatus.stopped)
      return { success: true }
    } catch (error) {
      console.error('停止链接失败:', error)
      this.broadcastStatus(ServerStatus.error)
      return { success: false, error: (error as Error).message }
    }
  }

  private handleClientConnection(ws: WebSocket, req: any): void {
    const clientId = randomUUID()
    const clientInfo = {
      id: clientId,
      ws: ws,
      connectedAt: new Date(),
      info: null
    }

    this.clients.set(clientId, clientInfo)

    ws.on('message', (data: WebSocket.Data) => {
      this.handleClientMessage(clientId, data)
    })

    ws.on('close', () => {
      const client = this.clients.get(clientId)
      if (client) {
        this.emit('node-disconnected', client.info)
        this.clients.delete(clientId)
      }
    })

    ws.on('error', (error) => {
      console.error('客户端连接错误:', error)
      this.clients.delete(clientId)
    })
  }

  private handleClientMessage(clientId: string, data: WebSocket.Data): void {
    try {
      const message: NetworkMessage = JSON.parse(data.toString())
      const client = this.clients.get(clientId)

      if (!client) return

      switch (message.type) {
        case 'node-info':
          client.info = {
            nodeId: message.nodeId!,
            platform: message.platform!,
            hostname: message.hostname!,
            connectedAt: client.connectedAt
          }
          this.emit('node-connected', client.info)
          break

        case 'pack-task':
          this.broadcastToAll(message)
          break

        case 'task-status':
          this.broadcastToAll(message)
          break

        default:
          console.log('未知消息类型:', message.type)
      }
    } catch (error) {
      console.error('处理客户端消息失败:', error)
    }
  }

  private handleServerMessage(ws: WebSocket, data: WebSocket.Data): void {
    try {
      const message: NetworkMessage = JSON.parse(data.toString())

      switch (message.type) {
        case 'pack-task':
          this.emit('pack-task', message.data)
          break

        case 'task-status':
          this.emit('task-status', message.data)
          break

        default:
          console.log('未知服务器消息类型:', message.type)
      }
    } catch (error) {
      console.error('处理服务器消息失败:', error)
    }
  }

  broadcastToAll(message: NetworkMessage): void {
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message))
      }
    })
  }

  sendToNode(nodeId: string, message: NetworkMessage): void {
    this.clients.forEach((client) => {
      if (client.info && client.info.nodeId === nodeId) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify(message))
        }
      }
    })
  }

  sendToServer(message: NetworkMessage): void {
    if (this.clientWs && this.clientWs.readyState === WebSocket.OPEN) {
      this.clientWs.send(JSON.stringify(message))
    }
  }

  getConnectedNodes(): NodeInfo[] {
    const nodes: NodeInfo[] = []
    this.clients.forEach((client) => {
      if (client.info) {
        nodes.push(client.info)
      }
    })
    return nodes
  }

  getNodeInfo(): NodeInfo {
    return {
      nodeId: this.nodeId,
      platform: process.platform,
      hostname: hostname(),
      connectedAt: new Date(),
      isServer: this.isServer
    }
  }

  getNodeId(): string {
    return this.nodeId
  }

  isServerMode(): boolean {
    return this.isServer
  }

  getServerPort(): number | null {
    return this.serverPort
  }

  disconnect(): void {
    if (this.clientWs) {
      this.clientWs.close()
      this.clientWs = null
    }

    if (this.server) {
      this.server.close()
      this.server = null
    }

    if (this.wss) {
      this.wss.close()
      this.wss = null
    }
  }
}
