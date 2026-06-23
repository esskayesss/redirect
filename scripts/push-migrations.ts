import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SQL } from "bun";

const databaseUrl = Bun.env.DATABASE_URI ?? Bun.env.DATABASE_URL;
const db = databaseUrl ? new SQL(databaseUrl) : new SQL();
const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url));

try {
	const migrationFiles = (await readdir(migrationsDir))
		.filter((file) => file.endsWith(".sql"))
		.sort((a, b) => a.localeCompare(b));

	if (migrationFiles.length === 0) {
		console.log("No migrations found.");
	} else {
		for (const migrationFile of migrationFiles) {
			const migrationPath = fileURLToPath(
				new URL(`../migrations/${migrationFile}`, import.meta.url),
			);

			console.log(`Applying ${migrationFile}...`);
			await db.unsafe(await Bun.file(migrationPath).text()).simple();
		}

		console.log(`Applied ${migrationFiles.length} migration(s).`);
	}
} finally {
	await db.end();
}
