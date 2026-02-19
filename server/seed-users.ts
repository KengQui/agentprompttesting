import { storage } from "./storage";

const SEED_USERS = [
  { username: "admin", password: "admin123" },
  { username: "demo", password: "demo1234" },
  { username: "testuser", password: "test1234" },
];

export async function seedUsers(): Promise<void> {
  console.log("[seed] Checking for initial user accounts...");

  let created = 0;
  let skipped = 0;

  for (const user of SEED_USERS) {
    const existing = await storage.getUserByUsername(user.username);
    if (existing) {
      skipped++;
      continue;
    }

    try {
      await storage.createUser({ username: user.username, password: user.password });
      created++;
      console.log(`[seed] Created user: ${user.username}`);
    } catch (error: any) {
      console.error(`[seed] Failed to create user ${user.username}: ${error.message}`);
    }
  }

  if (created > 0) {
    console.log(`[seed] Seeded ${created} user account(s), skipped ${skipped} existing`);
  } else {
    console.log(`[seed] All ${skipped} seed accounts already exist, nothing to do`);
  }
}
