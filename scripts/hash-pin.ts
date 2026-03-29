import bcrypt from 'bcryptjs'

async function main() {
  const pin = process.argv[2]
  if (!pin) {
    console.error('Usage: npm run hash-pin -- <pin>')
    process.exit(1)
  }
  const hash = await bcrypt.hash(pin, 10)
  console.log(hash)
}

main()
