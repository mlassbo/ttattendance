const { spawn } = require('child_process')
const { config: loadEnv } = require('dotenv')

loadEnv({ path: '.env.test.local', override: true })

const port = process.env.PLAYWRIGHT_PORT || '3001'
const command = `npm run dev -- --port ${port}`

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

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal)
  })
}

child.on('exit', code => {
  process.exit(code ?? 0)
})