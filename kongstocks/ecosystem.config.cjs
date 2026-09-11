function readEnv(file) {
  const fs = require('fs')
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return out
}

module.exports = {
  apps: [
    {
      name: 'kongstocks-staging',
      cwd: '/opt/kongstocks/app',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3010',
      env: readEnv('/opt/kongstocks/deploy/.env.staging'),
    },
    {
      name: 'kongstocks-prod',
      cwd: '/opt/kongstocks/app',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3011',
      env: readEnv('/opt/kongstocks/deploy/.env.prod'),
    },
  ],
}
