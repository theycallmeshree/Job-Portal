import { contextBridge } from 'electron'
contextBridge.exposeInMainWorld('env', { ok: true })
