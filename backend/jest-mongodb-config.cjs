const fs = require('fs')
const isWin = process.platform === 'win32'
const localWinBinary = 'C:\\Users\\regin\\.gemini\\antigravity\\scratch\\spandan-main\\mongodb-win32-x86_64-windows-7.0.24\\bin\\mongod.exe'

const config = {
  mongodbMemoryServerOptions: {
    instance: {
      dbName: 'jest'
    }
  }
}

if (isWin && fs.existsSync(localWinBinary)) {
  config.mongodbMemoryServerOptions.binary = {
    systemBinary: localWinBinary,
    skipMD5: true
  }
}

module.exports = config
