const fs = require('fs');
const path = require('path');

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { sendErrorMessage } = require('./error');

/**
 * Fetches workshop addon data from the Steam API.
 * This function retrieves details about a specific workshop addon
 * and returns all of its data.
 *
 * @param addonId
 * @returns {Promise<*|boolean>}
 */
async function getWorkshopAddonData(addonId) {
	const params = new URLSearchParams();
	params.append('itemcount', '1');
	params.append('publishedfileids[0]', addonId);

	const response = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: params.toString(),
	});

	if (!response.ok) {
		return false;
	}

	const data = await response.json();

	if (
		!data.response ||
		!data.response.result ||
		data.response.result === 0 ||
		!data.response.resultcount ||
		data.response.resultcount === 0 ||
		!data.response.publishedfiledetails ||
		data.response.publishedfiledetails.length === 0
	) {
		return false;
	}
	else {
		const fileDetails = data.response.publishedfiledetails[0];

		if (
			!fileDetails.publishedfileid ||
			fileDetails.publishedfileid !== addonId ||
			fileDetails.result === undefined
		) {
			return false;
		}

		if (Object.keys(data.response.publishedfiledetails[0]).length < 3) {
			return false;
		}
	}

	return data.response.publishedfiledetails[0];
}

/**
 * This module provides functions to fetch game details and account details from the Steam API.
 * It includes error handling for invalid inputs and API response checks.
 *
 * @param steamId64
 * @returns {Promise<*|null>}
 */
async function getAccountDetails(steamId64) {
	if (!steamId64 || !/^\d{17}$/.test(steamId64)) {
		console.error('Error | Invalid Steam ID64 format. It should be a 17-digit number.');
		return null;
	}

	if (!process.env.STEAM_API_KEY) {
		console.error('Error | STEAM_API_KEY is not set in the environment variables.');
		return null;
	}

	const params = new URLSearchParams();
	params.append('key', process.env.STEAM_API_KEY);
	params.append('steamids', steamId64);

	try {
		const response = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?${params.toString()}`);

		if (!response.ok) {
			console.error(`Error | Failed to fetch account details: ${response.status} ${response.statusText}`);
			return null;
		}

		const data = await response.json();

		if (!data.response || !data.response.players || data.response.players.length === 0) {
			console.error('Error | No account details found for the provided Steam ID64.');
			return null;
		}

		return data.response.players[0];

	}
	catch (error) {
		console.error(`Error | An exception occurred while fetching Steam account details: ${error.message}`);
		return null;
	}
}

/**
 * Fetches game details from the Steam API using the provided game ID.
 * This function checks if the game ID is valid and handles API response errors.
 *
 * @param gameId
 * @returns {Promise<*|null>}
 */
async function getGameDetails(gameId) {
	const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${gameId}`);
	const data = await response.json();

	if (!data[gameId] || !data[gameId].success) {
		console.error(`Error | No game details found for the provided game ID: ${gameId}`);
		return null;
	}

	return data[gameId].data;
}

const activeConfirmations = new Map();

/**
 * Sends a confirmation dialogue to the user.
 * This function checks if the user already has a pending confirmation,
 * creates an embed with confirmation details,
 * and listens for the user's response.
 *
 * @param interaction
 * @param title
 * @param description
 * @param confirmationDetails
 * @param customId
 * @returns {Promise<boolean>}
 */
async function sendConfirmationDialogue(interaction, title, description, confirmationDetails, customId) {
	const userId = interaction.user.id;

	if (activeConfirmations.has(userId)) {
		sendErrorMessage(interaction, {
			'Error': 'You already have a pending confirmation.',
			'User ID': interaction.user.id,
			'Custom ID': customId,
		}).then(r =>
			console.error(`Error | User ${interaction.user.id} already has a pending confirmation with custom ID: ${customId}`));
		return false;
	}

	const embedData = new EmbedBuilder()
		.setTitle(title || 'Confirmation Required')
		.setDescription(description || 'Are you sure you want to proceed?')
		.setColor('#3C3C3C')
		.setFooter({
			text: interaction.client.user.displayName,
			iconURL: interaction.client.user.displayAvatarURL(),
		})
		.setTimestamp();

	if (confirmationDetails) {
		for (const [key, value] of Object.entries(confirmationDetails)) {
			if (value) {
				embedData.addFields({ name: key, value: `\`${value}\`` });
			}
		}
	}

	const cancelledEmbedData = new EmbedBuilder()
		.setTitle('Action Cancelled')
		.setDescription('The action has been cancelled.')
		.setColor('#FF0000')
		.setFooter({
			text: interaction.client.user.displayName,
			iconURL: interaction.client.user.displayAvatarURL(),
		})
		.setTimestamp();

	const confirmedEmbedData = new EmbedBuilder()
		.setTitle('Action Confirmed')
		.setDescription('The action has been confirmed.')
		.setColor('#00FF00')
		.setFooter({
			text: interaction.client.user.displayName,
			iconURL: interaction.client.user.displayAvatarURL(),
		})
		.setTimestamp();

	const embedButtons = new ActionRowBuilder()
		.addComponents(
			new ButtonBuilder()
				.setCustomId(`${customId}-confirm`)
				.setLabel('Confirm')
				.setStyle(ButtonStyle.Success),
			new ButtonBuilder()
				.setCustomId(`${customId}-cancel`)
				.setLabel('Cancel')
				.setStyle(ButtonStyle.Danger),
		);

	let sentMessage;
	if (interaction.replied || interaction.deferred) {
		sentMessage = await interaction.followUp({
			embeds: [embedData],
			components: [embedButtons],
			flags: 64,
		});
	}
	else {
		sentMessage = await interaction.reply({
			embeds: [embedData],
			components: [embedButtons],
			flags: 64,
		});
	}

	activeConfirmations.set(userId, true);

	try {
		const confirmation = await interaction.channel.awaitMessageComponent({
			filter: (i) => i.user.id === userId && (i.customId === `${customId}-confirm` || i.customId === `${customId}-cancel`),
			time: 60000,
			componentType: ComponentType.Button,
		});

		if (confirmation.customId === `${customId}-cancel`) {
			await confirmation.update({ content: '', embeds: [cancelledEmbedData], components: [] });
			activeConfirmations.delete(userId);
			return false;
		}

		if (confirmation.customId === `${customId}-confirm`) {
			await confirmation.update({ content: '', embeds: [confirmedEmbedData], components: [] });
			activeConfirmations.delete(userId);
			return true;
		}
	}
	catch (error) {
		try {
			await sentMessage.edit({
				content: '',
				embeds: [
					new EmbedBuilder()
						.setTitle('Confirmation Timed Out')
						.setDescription('You did not respond in time. The confirmation has expired.')
						.setColor('#808080')
						.setFooter({
							text: interaction.client.user.displayName,
							iconURL: interaction.client.user.displayAvatarURL(),
						})
						.setTimestamp(),
				],
				components: [],
			});
		}
		catch (editErr) {
			console.error('Failed to edit expired confirmation message:', editErr);
		}

		activeConfirmations.delete(userId);
		return false;
	}
}

const dataDirPath = path.join(__dirname, '..', 'data');
const dataFilePath = path.join(dataDirPath, 'notifications.json');

/**
 * Ensures the data file exists by checking if it exists and creating it if not.
 */
function ensureDataFile() {
	if (!fs.existsSync(dataDirPath)) {
		fs.mkdirSync(dataDirPath, { recursive: true }); // Create directory if it doesn't exist
	}

	if (!fs.existsSync(dataFilePath) || fs.statSync(dataFilePath).size === 0) {
		fs.writeFileSync(dataFilePath, JSON.stringify({}, null, 4));
	}
}

/**
 * Reads data from the notifications JSON file.
 * This function ensures the data file exists before reading it.
 *
 * @returns {any}
 */
function readData() {
	ensureDataFile();
	try {
		const rawData = fs.readFileSync(dataFilePath, 'utf-8');
		if (!rawData.trim()) {
			saveData({});
			return {};
		}
		return JSON.parse(rawData);
	}
	catch (error) {
		console.error('Error reading JSON data:', error);
		saveData({});
		return {};
	}
}

/**
 * Saves data to the notifications JSON file.
 *
 * @param data
 */
function saveData(data) {
	fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 4));
}

/**
 * Loads data from the notifications JSON file.
 * This function reads the data and returns it as an object.
 *
 * @param guildId
 * @param channelId
 * @param type
 * @param id
 * @returns {boolean}
 */
function isNotification(guildId, channelId, type, id) {
	const data = readData();
	return !!(data[guildId] && data[guildId][channelId] && data[guildId][channelId].some(entry => entry.type === type && entry.id === id));
}

/**
 * Adds a notification to the notifications JSON file.
 * This function checks if the notification already exists
 * and adds it if not.
 *
 * @param guildId
 * @param channelId
 * @param type
 * @param id
 * @returns {boolean}
 */
function addNotification(guildId, channelId, type, id) {
	const data = readData();

	if (!data[guildId]) {
		data[guildId] = {};
	}

	if (!data[guildId][channelId]) {
		data[guildId][channelId] = [];
	}

	if (data[guildId][channelId].some(entry => entry.type === type && entry.id === id)) {
		return false;
	}

	data[guildId][channelId].push({ type, id });
	saveData(data);
	return true;
}

/**
 * Removes a notification from the notifications JSON file.
 * This function checks if the notification exists
 * and removes it if found.
 *
 * @param guildId
 * @param channelId
 * @param type
 * @param id
 * @returns {boolean}
 */
function removeNotification(guildId, channelId, type, id) {
	const data = readData();

	if (!data[guildId] || !data[guildId][channelId]) {
		return false;
	}

	const initialLength = data[guildId][channelId].length;
	data[guildId][channelId] = data[guildId][channelId].filter(entry => !(entry.type === type && entry.id === id));

	if (data[guildId][channelId].length === 0) {
		delete data[guildId][channelId];
	}
	if (Object.keys(data[guildId]).length === 0) {
		delete data[guildId];
	}

	if (initialLength === data[guildId]?.[channelId]?.length) {
		return false;
	}

	saveData(data);
	return true;
}

/**
 * Removes all notifications for a specific channel in a guild.
 * This function checks if the channel exists
 * and removes all notifications for that channel.
 *
 * @param guildId
 * @param channelId
 * @returns {boolean}
 */
function removeAllNotifications(guildId, channelId) {
	const data = readData();

	if (!data[guildId] || !data[guildId][channelId]) {
		return false;
	}

	delete data[guildId][channelId];

	if (Object.keys(data[guildId]).length === 0) {
		delete data[guildId];
	}

	saveData(data);
	return true;
}

/**
 * Loads data from the notifications JSON file.
 * This function reads the data and returns it as an object.
 *
 * @param guildId
 * @returns {*|{}}
 */
function getGuildNotifications(guildId) {
	const data = readData();
	return data[guildId] || {};
}

/**
 * Gets notifications for a specific channel in a guild.
 * This function retrieves notifications for a specific channel
 * and returns them as an array.
 *
 * @param guildId
 * @param channelId
 * @returns {*|*[]}
 */
function getChannelNotifications(guildId, channelId) {
	const data = readData();
	return data[guildId]?.[channelId] || [];
}

/**
 * Sets the last updated timestamp for a specific notification.
 * This function updates the last updated timestamp
 * for a specific notification type and ID in a guild and channel.
 *
 * @param guildId
 * @param channelId
 * @param type
 * @param id
 * @param timestamp
 * @returns {boolean}
 */
function setNotificationLastUpdated(guildId, channelId, type, id, timestamp) {
	const data = readData();

	if (!data[guildId] || !data[guildId][channelId]) {
		return false;
	}

	const notification = data[guildId][channelId].find(entry => entry.type === type && entry.id === id);
	if (notification) {
		notification.lastUpdated = timestamp;
		saveData(data);
		return true;
	}

	return false;
}

/**
 * Gets the last updated timestamp for a specific notification.
 * This function retrieves the last updated timestamp
 * for a specific notification type and ID in a guild and channel.
 *
 * @param guildId
 * @param channelId
 * @param type
 * @param id
 * @returns {*|null}
 */
function getNotificationLastUpdated(guildId, channelId, type, id) {
	const data = readData();

	if (!data[guildId] || !data[guildId][channelId]) {
		return null;
	}

	const notification = data[guildId][channelId].find(entry => entry.type === type && entry.id === id);
	return notification ? notification.lastUpdated : null;
}

module.exports = {
	getWorkshopAddonData,
	getAccountDetails,
	getGameDetails,
	sendConfirmationDialogue,
	isNotification,
	addNotification,
	removeNotification,
	removeAllNotifications,
	getGuildNotifications,
	getChannelNotifications,
	setNotificationLastUpdated,
	getNotificationLastUpdated,
};