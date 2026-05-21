const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('--- FOLDERS ---');
    const folders = await prisma.folder.findMany();
    console.log(JSON.stringify(folders, null, 2));

    console.log('--- FILES ---');
    const files = await prisma.file.findMany({ take: 10 });
    console.log(JSON.stringify(files, null, 2));

    console.log('--- USERS ---');
    const users = await prisma.user.findMany({ select: { id: true, email: true, username: true, role: true } });
    console.log(JSON.stringify(users, null, 2));
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
