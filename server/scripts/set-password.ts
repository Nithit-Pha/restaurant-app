// Change the password of any login from the command line (run it on the shop PC):
//
//   cd server
//   npm run set-password -- <username>
//
// Asks for the new password twice. In Command Prompt and PowerShell the typing
// is not shown on screen. The user is also signed out on every device
// (tokenVersion + 1), so a stolen session stops working.
import 'dotenv/config';
import bcrypt from 'bcrypt';
import readline from 'readline';
import { PrismaClient } from '@prisma/client';

// Same minimum as creating a staff account (server/src/modules/auth/staff.routes.ts).
const MIN_LENGTH = 8;

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: Boolean(process.stdin.isTTY),
});
// Never echo what is typed: both answers are passwords.
(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
rl.on('SIGINT', () => fail('Cancelled. The password was not changed.'));
const lines = rl[Symbol.asyncIterator]();

async function askHidden(question: string): Promise<string> {
  process.stdout.write(question);
  const { value, done } = await lines.next();
  process.stdout.write('\n');
  if (done) fail('No input. The password was not changed.');
  return String(value);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const username = (process.argv[2] ?? '').trim().toLowerCase();
  if (!username) fail('Usage: npm run set-password -- <username>');

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) fail(`No login with the username "${username}".`);

  console.log(`Changing the password for "${user.username}" (${user.name}, ${user.role}).`);
  const password = await askHidden(`New password (at least ${MIN_LENGTH} characters): `);
  if (password.length < MIN_LENGTH) fail(`Too short. The password was not changed.`);
  const again = await askHidden('Type it again: ');
  if (again !== password) fail('The two passwords do not match. The password was not changed.');

  await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(password, 12), tokenVersion: { increment: 1 } },
  });
  console.log(`Done. "${user.username}" now signs in with the new password and is signed out on every device.`);
}

main()
  .catch((err) => fail(`Failed: ${err instanceof Error ? err.message : String(err)}`))
  .finally(async () => {
    rl.close();
    await prisma.$disconnect();
  });
