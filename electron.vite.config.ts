import { resolve } from 'path'
import type { Connect, Plugin } from 'vite'
import * as fs from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/** 项目根目录下的 assets 文件夹 */
const PROJECT_ASSETS = resolve(__dirname, 'assets')
const RENDERER_OUT = resolve(__dirname, 'out/renderer')

/**
 * Vite 插件：直接从项目根 assets/ 目录提供静态资源，避免在 public 中维护副本
 * - 开发模式：通过 middleware 伺服 /assets/*
 * - 构建模式：将根 assets/ 复制到输出目录
 */
function assetsPlugin(): Plugin {
  return {
    name: 'assets-plugin',
    configureServer(server) {
      server.middlewares.use('/assets', (req, res, next) => {
        const url = (req.url || '').split('?')[0]
        const safePath = url.replace(/\.\.\//g, '').replace(/\.\.\\/g, '').replace(/^\/+/, '')
        const filePath = resolve(PROJECT_ASSETS, safePath)
        try {
          if (fs.statSync(filePath).isFile()) {
            const ext = filePath.split('.').pop()?.toLowerCase()
            const mimeMap: Record<string, string> = {
              png: 'image/png',
              jpg: 'image/jpeg',
              jpeg: 'image/jpeg',
              gif: 'image/gif',
              webp: 'image/webp',
              svg: 'image/svg+xml',
              mp3: 'audio/mpeg',
              ogg: 'audio/ogg',
              opus: 'audio/opus',
              wav: 'audio/wav',
              aac: 'audio/aac',
              m4a: 'audio/mp4',
              flac: 'audio/flac',
              webm: 'audio/webm'
            }
            const contentType = mimeMap[ext || ''] || 'application/octet-stream'
            res.writeHead(200, { 'Content-Type': contentType })
            const stream = fs.createReadStream(filePath)
            stream.pipe(res)
            stream.on('error', () => {
              res.writeHead(500)
              res.end()
            })
            return
          }
        } catch {
          // 文件不存在，交由其他中间件处理
        }
        next()
      })
    },
    closeBundle() {
      // 构建完成后，将根 assets/ 复制到输出目录
      if (fs.existsSync(PROJECT_ASSETS)) {
        const dest = resolve(RENDERER_OUT, 'assets')
        if (fs.existsSync(dest)) {
          fs.rmSync(dest, { recursive: true })
        }
        fs.cpSync(PROJECT_ASSETS, dest, { recursive: true })
        console.log(`[assets-plugin] 已复制 assets/ 到 ${dest}`)
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    publicDir: resolve(__dirname, 'src/renderer/public'),
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [react(), assetsPlugin()],
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer')
      }
    }
  }
})
