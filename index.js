const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
dotenv.config();

const { sendErrorMessage } = require('./modules/error');
const { getWorkshopAddonData, getGuildNotifications, setNotificationLastUpdated, getNotificationLastUpdated, removeNotification } = require('./modules/common');

const { REST, Routes, Client, Collection, Events, GatewayIntentBits } = require('discord.js');

const useGlobal = process.env.USE_GLOBAL ?? false;
const botToken = process.env.BOT_TOKEN ?? null;
const clientId = process.env.CLIENT_ID ?? null;
const guildId = process.env.GUILD_ID ?? null;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

client.commands = new Collection();

/**
 * Validates the required environment variables.
 * If any are missing, it logs an error and exits the process.
 */
function validateEnvVariables() {
	if (!botToken) {
		console.error('Error | BOT_TOKEN is not set in the environment variables.');
		process.exit(1);
	}
	if (!clientId) {
		console.error('Error | CLIENT_ID is not set in the environment variables.');
		process.exit(1);
	}
	if (!guildId && !useGlobal) {
		console.error('Error | GUILD_ID is not set in the environment variables and USE_GLOBAL is false.');
		process.exit(1);
	}
}

validateEnvVariables();

/**
 * Autofill support for command options based on user input.
 */
client.on('interactionCreate', async interaction => {
	try {
		if (interaction.isAutocomplete()) {
			const command = client.commands.get(interaction.commandName);
			if (command && command.autocomplete) {
				await command.autocomplete(interaction);
			}
			return;
		}

		if (interaction.isChatInputCommand()) {
			const command = client.commands.get(interaction.commandName);
			if (!command) return;

			await command.execute(interaction);
		}
	}
	catch (error) {
		console.error('Error | Error handling interaction:', error);
	}
});

/**
 * Scans the commands directory for command files and loads them into the client.commands collection.
 *
 * @returns {Array} An array of command data objects to be used for deploying commands.
 */
function scanCommands() {
	const validCommands = [];
	const deployedCommands = [];

	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);

		let command;
		try {
			command = require(filePath);
		}
		catch (err) {
			console.error(`Error | Failed to load command file: ${filePath}\n`, err);
			continue;
		}

		if ('data' in command && 'execute' in command) {
			validCommands.push({ name: command.data.name, command });
			deployedCommands.push(command.data.toJSON());
		}
		else {
			console.error(`Error | Command file (${filePath}) does not have the required properties: "data" or "execute".`);
		}
	}

	for (const { name, command } of validCommands) {
		client.commands.set(name, command);
	}

	console.log(`Info | Loaded ${validCommands.length} valid command(s).`);
	return deployedCommands;
}

const commands = scanCommands() || [];

/**
 * Handles incoming interactions and executes the corresponding command.
 * This listener checks if the interaction is a chat input command, retrieves the command,
 * and safely executes it with proper error handling and user feedback.
 */
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;

	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`Error | No command matching (${interaction.commandName}) was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	}
	catch (error) {
		console.error(`Error | Failed to execute command (${interaction.commandName})\n`, error);

		try {
			await sendErrorMessage(interaction, {
				'Command Name': interaction.commandName,
				'Error Details': error.message || 'An unknown error occurred.',
			});
		}
		catch (sendError) {
			console.error('Error | Failed to send error message:', sendError?.message || sendError);
		}
	}
});

/**
 * This function deploys application (/) commands to the specified guild.
 * This function refreshes all commands using Discord's REST API.
 */
function deployCommands() {
	const rest = new REST().setToken(botToken);

	(async () => {
		try {
			console.log(`Info | Started refreshing ${commands.length} application (/) command(s).`);

			const route = useGlobal
				? Routes.applicationCommands(clientId)
				: Routes.applicationGuildCommands(clientId, guildId);

			const data = await rest.put(route, { body: commands });

			console.log(`Success | Successfully reloaded ${data.length} application (/) command(s).`);
		}
		catch (error) {
			console.error('Error | Failed to deploy application (/) commands.\n', error);
		}
	})();
}

deployCommands();

/**
 * Triggered once when the client becomes ready.
 * Logs a confirmation message with the bot's tag.
 */
client.once(Events.ClientReady, readyClient => {
	console.log(`Success | Logged in as: ${readyClient.user.tag}`);

	readyClient.user.setPresence({
		activities: [{
			name: 'The Steam API',
			type: 2,
		}],
		status: 'online',
	});

	setInterval(() => {
		client.guilds.cache.forEach(guild => {
			const searchGuildId = guild.id;
			const guildNotifications = getGuildNotifications(searchGuildId);

			for (const [channelId, notifications] of Object.entries(guildNotifications)) {
				const channel = guild.channels.cache.get(channelId);

				if (!channel) {
					notifications.forEach(notification => {
						const { type, id } = notification;
						removeNotification(searchGuildId, channelId, type, id);
						console.log(`Info | Removed notification for ID: ${id} in Guild: ${searchGuildId}, Channel: ${channelId} (channel not found)`);
					});
					continue;
				}

				notifications.forEach(notification => {
					const { type, id } = notification;
					const lastUpdated = getNotificationLastUpdated(searchGuildId, channelId, type, id);

					getWorkshopAddonData(id).then(data => {
						if (data) {
							if (!lastUpdated) {
								setNotificationLastUpdated(searchGuildId, channelId, type, id, data.time_updated);
								console.log(`Info | Set initial notification for ID: ${id} in Guild: ${searchGuildId}, Channel: ${channelId}, Type: ${type}`);
							}
							else {
								const currentTime = Date.now();
								const timeDifference = currentTime - lastUpdated;

								if (timeDifference >= 300000) {
									setNotificationLastUpdated(searchGuildId, channelId, type, id, data.time_updated);
									// Send a message to the channel with the updated data. (Also dependant on type)
									console.log(`Info | Updated notification for ID: ${id} in Guild: ${searchGuildId}, Channel: ${channelId}, Type: ${type}`);
								}
							}
						}
						else {
							console.warn(`Error | No data found for ID: ${id} in Guild: ${searchGuildId}, Channel: ${channelId}, Type: ${type}`);
						}
					}).catch(err => {
						console.error(`Error | Error fetching data for ID: ${id} in Guild: ${searchGuildId}, Channel: ${channelId}, Type: ${type}`, err);
					});

					console.log(`Info | Guild: ${searchGuildId} | Channel: ${channelId} | Type: ${type} | ID: ${id} | Last Updated: ${lastUpdated}`);
				});
			}
		});
	}, 10000); // 10 seconds for testing (set to 300000 for production)
});

/**
 * Handles errors that occur during the execution of the bot.
 * Logs the error and sends a message to the console.
 */
process.on('unhandledRejection', error => {
	console.error('Error | Unhandled promise rejection:', error);
});

client.login(botToken);