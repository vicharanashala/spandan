import fs from 'fs'
const localWinBinary = 'C:\\Users\\regin\\.gemini\\antigravity\\scratch\\spandan-main\\mongodb-win32-x86_64-windows-7.0.24\\bin\\mongod.exe'

const binaryOptions = fs.existsSync(localWinBinary)
  ? { systemBinary: localWinBinary, skipMD5: true }
  : { skipMD5: true }

export default {
  mongodbMemoryServerOptions: {
    binary: binaryOptions,
    autoStart: false,
    instance: {
      dbName: 'jest'
    }
  }
}
