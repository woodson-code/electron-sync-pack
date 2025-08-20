import { createWriteStream, createReadStream } from 'fs'
import { pipeline } from 'stream/promises'
import { join } from 'path'

export class FileTransfer {
  async compressFile(sourcePath: string, targetPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(targetPath)
      // 延迟加载 archiver，避免应用启动时即解析依赖
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      ;(async () => {
        const { default: archiver } = await import('archiver')
        const archive = archiver('zip', {
          zlib: { level: 9 } // 设置压缩级别
        })

        output.on('close', () => {
          resolve()
        })

        archive.on('error', (err) => {
          reject(err)
        })

        archive.pipe(output)
        archive.file(sourcePath, { name: sourcePath.split('/').pop() })
        archive.finalize()
      })().catch(reject)
    })
  }

  async extractFile(sourcePath: string, targetPath: string): Promise<void> {
    const extract = (await import('extract-zip')).default as unknown as (
      src: string,
      opts: { dir: string }
    ) => Promise<void>
    await extract(sourcePath, { dir: targetPath })
  }

  async compressDirectory(sourceDir: string, targetPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(targetPath)
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      ;(async () => {
        const { default: archiver } = await import('archiver')
        const archive = archiver('zip', {
          zlib: { level: 9 }
        })

        output.on('close', () => {
          resolve()
        })

        archive.on('error', (err) => {
          reject(err)
        })

        archive.pipe(output)
        archive.directory(sourceDir, false)
        archive.finalize()
      })().catch(reject)
    })
  }

  async transferFile(sourcePath: string, targetPath: string): Promise<void> {
    const readStream = createReadStream(sourcePath)
    const writeStream = createWriteStream(targetPath)
    
    await pipeline(readStream, writeStream)
  }
}
