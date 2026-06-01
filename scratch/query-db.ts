import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- Querying Users ---')
  const users = await prisma.user.findMany({
    select: {
      id: true,
      urlId: true,
      vanityId: true,
      name: true,
    }
  })
  console.log(JSON.stringify(users, null, 2))

  console.log('--- Querying Files ---')
  const files = await prisma.file.findMany({
    select: {
      id: true,
      name: true,
      urlPath: true,
      path: true,
      size: true,
    }
  })
  console.log(JSON.stringify(files, null, 2))
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
