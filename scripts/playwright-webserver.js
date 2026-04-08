const { spawn } = require('child_process')
const { config: loadEnv } = require('dotenv')

loadEnv({ path: '.env.test.local', override: true })

const port = process.env.PLAYWRIGHT_PORT || '3001'
const commands = [
  'npm run build',
  `npm run start -- --port ${port}`,
]

let activeChild = null

function forwardSignal(signal) {
  if (activeChild) {
    activeChild.kill(signal)
  }
}

function spawnCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        E2E_TEST_ENV: 'true',
        PLAYWRIGHT_PORT: port,
        PORT: port,
      },
    })

    activeChild = child

    child.on('exit', code => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`Command failed with exit code ${code ?? 'unknown'}: ${command}`))
    })

    child.on('error', reject)
  })
}

async function main() {
  try {
    await spawnCommand(commands[0])
    await spawnCommand(commands[1])
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => forwardSignal(signal))
}

main()