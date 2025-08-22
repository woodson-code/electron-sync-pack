export enum ServerStatus {
  running = 'running',
  stopped = 'stopped',
  starting = 'starting',
  closing = 'closing',
  error = 'error',
  connected = 'connected'
}

export default {
  Network: {
    Channel: {
      /**
       * 网络状态监听事件
       */
      Server_STATUS_CHANGED: 'onlineStatusChanged'
    }
  }
}
