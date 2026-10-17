const branch = process.argv[2]
if (!['dev', 'main'].includes(branch)) {
  console.error('Usage: npm run lane:names -- dev|main')
  process.exitCode = 1
} else {
  const environment = branch === 'dev' ? 'dev' : 'production'
  const name = `personal-fitness-${environment}`
  console.log(JSON.stringify({ branch, environment, worker: name, database: name, provisioned: true }, null, 2))
}
