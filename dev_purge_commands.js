// purge-commands.js

const dotenv = require('dotenv');
dotenv.config();

const { REST, Routes } = require('discord.js');

const useGlobal = process.env.USE_GLOBAL ?? false;
const botToken = process.env.BOT_TOKEN ?? null;
const clientId = process.env.CLIENT_ID ?? null;
const guildId = process.env.GUILD_ID ?? null;

if (!botToken || !clientId) {
	console.error('Error | Missing BOT_TOKEN or CLIENT_ID in environment configuration.');
	process.exit(1);
}

const rest = new REST().setToken(botToken);

/**
 * Fetches and deletes all registered application (/) commands.
 */
async function purgeCommands() {
	try {
		console.log('Info | Fetching existing commands...');

		if (useGlobal) {
			const globalCommands = await rest.get(Routes.applicationCommands(clientId));

			if (globalCommands.length < 1) {
				console.log('Info | No global commands to delete.');
			}

			for (const cmd of globalCommands) {
				console.log(`Info | Deleting global command: ${cmd.name}`);
				await rest.delete(`${Routes.applicationCommands(clientId)}/${cmd.id}`);
			}
		}
		else {
			if (!guildId) {
				console.error('Error | Missing GUILD_ID for guild command cleanup.');
				process.exit(1);
			}

			const guildCommands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));

			if (guildCommands.length < 1) {
				console.log('Info | No guild commands to delete.');
			}

			for (const cmd of guildCommands) {
				console.log(`Info | Deleting guild command: ${cmd.name}`);
				await rest.delete(`${Routes.applicationGuildCommands(clientId, guildId)}/${cmd.id}`);
			}
		}

		console.log('Success | Finished clearing all application (/) commands.');
	}
	catch (error) {
		console.error('Error | Failed to purge commands.\n', error);
	}
}

purgeCommands();