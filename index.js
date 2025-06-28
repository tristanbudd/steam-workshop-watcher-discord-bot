const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
dotenv.config();

const { sendErrorMessage } = require('./modules/error');
const { getWorkshopAddonData, getGuildNotifications, setNotificationLastUpdated, getNotificationLastUpdated, removeNotification,
	getAccountDetails,
} = require('./modules/common');

const { REST, Routes, Client, Collection, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');

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
 * Scans the commands directory for command files and loads them into the client.commands collection.
 *
 * @returns {Array} An array of command data objects to be used for deploying commands.
 */
function scanCommands() {
	const validCommands = [];
	const deployedCommands = [];

	const loadedCommandNames = new Set();

	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);

		let command;
		try {
			command = require(filePath);
		}
		catch (error) {
			console.error(`Error | Failed to load command file: ${filePath}\n`, error);
			continue;
		}

		if ('data' in command && 'execute' in command) {
			if (loadedCommandNames.has(command.data.name)) {
				console.error(`Error | Duplicate command name detected: "${command.data.name}" in file: ${filePath}`);
				continue;
			}

			loadedCommandNames.add(command.data.name);

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
client.on(Events.InteractionCreate, async (interaction) => {
	if (interaction.isChatInputCommand()) {
		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			console.error(`Error | No command matching (${interaction.commandName}) was found.`);
			return;
		}

		try {
			await command.execute(interaction);
		}
		catch (error) {
			if (error.code !== 10062) { // Ignore "Unknown interaction" errors
				console.error(`Error | Failed to execute command (${interaction.commandName})\n`, error);

				try {
					await sendErrorMessage(interaction, {
						'Command Name': interaction.commandName,
						'Error Details': error.message || 'An unknown error occurred.',
					});
				}
				catch (sendError) {
					// Failing to send the error message is non-critical.
				}
			}
		}
	}
	else if (interaction.isAutocomplete()) {
		const command = interaction.client.commands.get(interaction.commandName);

		if (!command || !command.autocomplete) return;

		try {
			await command.autocomplete(interaction);
		}
		catch (error) {
			console.error(`Error | Autocomplete failed for command (${interaction.commandName})\n`, error);
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

	console.log(`Success | Deployed commands: ${commands.map(cmd => cmd.name).join(', ')}`);
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

	/**
	 * Sets up a periodic task to check for updates on workshop addons and collections.
	 */
	setInterval(async () => {
		for (const guild of client.guilds.cache.values()) {
			const searchGuildId = guild.id;
			const guildNotifications = getGuildNotifications(searchGuildId);

			for (const [channelId, notifications] of Object.entries(guildNotifications)) {
				const channel = guild.channels.cache.get(channelId);

				if (!channel) {
					notifications.forEach(notification => {
						const { type, id } = notification;
						removeNotification(searchGuildId, channelId, type, id);
					});
					continue;
				}

				for (const notification of notifications) {
					const { type, id } = notification;
					const lastUpdated = getNotificationLastUpdated(searchGuildId, channelId, type, id);

					try {
						const data = await getWorkshopAddonData(id);
						if (data) {
							if (!lastUpdated) {
								setNotificationLastUpdated(searchGuildId, channelId, type, id, data.time_updated);
							}
							else {
								const addonUpdateTime = data.time_updated || 0;
								const timeDifference = Date.now() - lastUpdated;

								if (addonUpdateTime > lastUpdated && addonUpdateTime > 0 && timeDifference >= 300000) {
									setNotificationLastUpdated(searchGuildId, channelId, type, id, data.time_updated);

									const steamId64 = data.creator || '0';
									let accountDetails = null;

									try {
										accountDetails = await getAccountDetails(steamId64);
									}
									catch (error) {
										console.error(`Error | Failed to fetch Steam account details: ${error.message}`);
									}

									let updateEmbedData = null;

									if (type === 'addon-update') {
										updateEmbedData = new EmbedBuilder()
											.setTitle('New Addon Update Available')
											.setDescription(`A new update is available for the addon: ${data.title || 'Unknown Addon'} (${id}).`)
											.setColor('#3C3C3C')
											.setThumbnail(data.preview_url || 'https://cdn.discordapp.com/embed/avatars/0.png')
											.setFooter({
												text: client.user.displayName,
												iconURL: client.user.displayAvatarURL(),
											})
											.setURL(`https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`)
											.addFields(
												{ name: 'Title', value: data.title || 'Unknown Addon', inline: true },
												{ name: 'Last Updated', value: new Date(lastUpdated * 1000).toLocaleDateString(), inline: true },
												{ name: 'Date Created', value: new Date(data.time_created * 1000).toLocaleDateString(), inline: true },
												{ name: 'Visibility', value: data.visibility === 0 ? 'Public' : data.visibility === 1 ? 'Friends Only' : 'Private', inline: true },
												{ name: 'File Size', value: `${(data.file_size / 1024 / 1024).toFixed(2)} MB`, inline: true },
												{ name: 'Subscriptions', value: data.subscriptions ? data.subscriptions.toLocaleString() : '0', inline: true },
												{ name: 'Addon URL', value: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`, inline: false },
											)
											.setTimestamp();

										if (accountDetails) {
											updateEmbedData.setAuthor({
												name: accountDetails.personaname || 'Unknown Creator',
												iconURL: accountDetails.avatarfull || 'https://cdn.discordapp.com/embed/avatars/0.png',
												url: accountDetails.profileurl || `https://steamcommunity.com/id/${steamId64}`,
											});
										}
									}
									else if (type === 'collection-update') {
										updateEmbedData = new EmbedBuilder()
											.setTitle('New Collection Update Available')
											.setDescription(`A new update is available for the collection: ${data.title || 'Unknown Collection'} (${id}).`)
											.setColor('#3C3C3C')
											.setThumbnail(data.file_url || 'https://cdn.discordapp.com/embed/avatars/0.png')
											.setFooter({
												text: client.user.displayName,
												iconURL: client.user.displayAvatarURL(),
											})
											.setURL(`https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`)
											.addFields(
												{ name: 'Title', value: data.title || 'Unknown Addon', inline: true },
												{ name: 'Last Updated', value: new Date(lastUpdated * 1000).toLocaleDateString(), inline: true },
												{ name: 'Date Created', value: new Date(data.time_created * 1000).toLocaleDateString(), inline: true },
												{ name: 'Collection URL', value: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`, inline: false },
											)
											.setTimestamp();

										if (accountDetails) {
											updateEmbedData.setAuthor({
												name: accountDetails.personaname || 'Unknown Creator',
												iconURL: accountDetails.avatarfull || 'https://cdn.discordapp.com/embed/avatars/0.png',
												url: accountDetails.profileurl || `https://steamcommunity.com/id/${steamId64}`,
											});
										}
									}

									try {
										await client.channels.cache.get(channelId)?.send({
											content: '',
											embeds: updateEmbedData ? [updateEmbedData] : [],
										});
									}
									catch (error) {
										console.error('Error | Failed to send update message:', error?.message || error);
									}
								}
							}
						}
						else {
							console.warn(`Error | No data found for ID: ${id} in Guild: ${searchGuildId}, Channel: ${channelId}, Type: ${type}`);
						}
					}
					catch (error) {
						console.error(`Error | Error fetching data for ID: ${id} in Guild: ${searchGuildId}, Channel: ${channelId}, Type: ${type}`, error);
					}
				}
			}
		}
	}, 30000);
	// 30 seconds for testing (set to 300000 for production)
});

/**
 * Handles errors that occur during the execution of the bot.
 * Logs the error and sends a message to the console.
 */
process.on('unhandledRejection', error => {
	console.error('Error | Unhandled promise rejection:', error);
});

client.login(botToken);