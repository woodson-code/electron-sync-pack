import { createWriteStream, createReadStream } from 'fs'
import { pipeline } from 'stream/promises'
import archiver from 'archiver'
import extract from 'extract-zip'
import { join } from 'path'

export class FileTransfer {
  async compressFile(sourcePath: string, targetPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(targetPath)
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
    })
  }

  async extractFile(sourcePath: string, targetPath: string): Promise<void> {
    await extract(sourcePath, { dir: targetPath })
  }

  async compressDirectory(sourceDir: string, targetPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(targetPath)
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
    })
  }

  async transferFile(sourcePath: string, targetPath: string): Promise<void> {
    const readStream = createReadStream(sourcePath)
    const writeStream = createWriteStream(targetPath)
    
    await pipeline(readStream, writeStream)
  }
}
