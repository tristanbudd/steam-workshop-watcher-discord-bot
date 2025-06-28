/**
 * @file add-collection-update.js
 * Handles the '/add-collection-update' command for Discord.
 *
 * This command allows users to add an automatic collection updater notification to a channel.
 */

const { sendConfirmationDialogue, isNotification, addNotification, getChannelNotifications } = require('../modules/common');

const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { sendErrorMessage } = require('../modules/error');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('add-collection-update')
		.setDescription('Add an automatic collection updater notification to this channel. (Requires Administrator)')

		.addStringOption(option =>
			option.setName('id')
				.setDescription('The ID of the Steam Workshop Collection.')
				.setRequired(true)
				.setMaxLength(20)
				.setMinLength(1)),
	async execute(interaction) {
		let error_count = 0;
		let error_message = '';

		if (
			!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
            interaction.guild.ownerId !== interaction.user.id
		) {
			error_count += 1;
			error_message = 'You must have Administrator permissions or be the Server Owner to use this command.';
		}

		const id = interaction.options.getString('id');
		if (!id) {
			error_count += 1;
			error_message = 'The ID of the Steam Workshop Collection is required.';
		}

		if (id && (id.length < 1 || id.length > 20)) {
			error_count += 1;
			error_message = 'The ID must be between 1 and 20 characters long.';
		}

		if (id && !/^\d+$/.test(id)) {
			error_count += 1;
			error_message = 'The ID must be a valid numeric Steam Workshop ID.';
		}

		const params = new URLSearchParams();
		params.append('itemcount', '1');
		params.append('publishedfileids[0]', id);

		const response = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: params.toString(),
		});

		if (!response.ok) {
			error_count += 1;
			error_message = `Failed to fetch data from the Steam API: ${response.statusText}`;
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
			error_count += 1;
			error_message = 'No details found for the provided ID or the ID is invalid.';
		}
		else {
			const fileDetails = data.response.publishedfiledetails[0];

			if (
				!fileDetails.publishedfileid ||
                fileDetails.publishedfileid !== id ||
                fileDetails.result === undefined
			) {
				error_count += 1;
				error_message = 'No details found for the provided ID or the ID is invalid.';
			}

			if (Object.keys(data.response.publishedfiledetails[0]).length < 3) {
				error_count += 1;
				error_message = 'No details found for the provided ID or the ID is invalid.';
			}
		}

		const collectionParams = new URLSearchParams();
		collectionParams.append('collectioncount', '1');
		collectionParams.append('publishedfileids[0]', id);

		const collectionResponse = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetCollectionDetails/v1/', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: collectionParams.toString(),
		});

		if (!collectionResponse.ok) {
			error_count += 1;
			error_message = `Failed to fetch data from the Steam API: ${response.statusText}`;
		}

		const collectionData = await collectionResponse.json();

		if (
			!collectionData.response ||
            !collectionData.response.result ||
            collectionData.response.result === 0 ||
            !collectionData.response.resultcount ||
            collectionData.response.resultcount === 0 ||
            !collectionData.response.collectiondetails ||
            collectionData.response.collectiondetails.length === 0
		) {
			error_count += 1;
			error_message = 'No details found for the provided ID or the ID is invalid. (Keep in mind collections must be public)';
		}
		else {
			const collectionDetails = collectionData.response.collectiondetails[0];

			if (
				!collectionDetails.publishedfileid ||
                collectionDetails.publishedfileid !== id ||
                collectionDetails.result === undefined
			) {
				error_count += 1;
				error_message = 'No details found for the provided ID or the ID is invalid. (Keep in mind collections must be public)';
			}
		}

		const collectionChannelLimit = 3;
		const channelNotifications = getChannelNotifications(interaction.guildId, interaction.channelId);
		if (channelNotifications.filter(n => n.type === 'collection-update').length >= collectionChannelLimit) {
			error_count += 1;
			error_message = `This channel already has the maximum number of collection updater notifications (${collectionChannelLimit}). Please remove an existing notification before adding a new one.`;
		}

		if (error_count < 1) {
			const guildId = interaction.guildId;
			const channelId = interaction.channelId;
			const channelName = interaction.channel.name;

			if (await sendConfirmationDialogue(interaction, 'Collection Update Notification Confirmation', 'You are about to set up and collection auto-updater notification to this channel.\n\nDo you want to proceed?', {
				'Collection ID': id,
				'Channel ID': channelId,
				'Channel Name': channelName,
				'Type': 'Collection Update',
			}, 'collection-update-confirmation')) {
				if (isNotification(guildId, channelId, 'collection-update', id)) {
					try {
						await sendErrorMessage(interaction, {
							'Command Name': interaction.commandName,
							'Error Details': 'An collection update notification for this ID already exists in this channel.',
						});
					}
					catch (sendError) {
						console.error('Error | Failed to send error message:', sendError?.message || sendError);
					}
					return;
				}

				addNotification(guildId, channelId, 'collection-update', id);

				const successEmbed = new EmbedBuilder()
					.setTitle('Auto Updater Notification Added')
					.setDescription('An automatic collection updater notification has been successfully added to this channel.')
					.setColor('#00FF00')
					.setFooter({
						text: interaction.client.user.displayName,
						iconURL: interaction.client.user.displayAvatarURL(),
					})
					.setTimestamp();

				successEmbed.addFields(
					{ name: 'Collection ID', value: id, inline: true },
					{ name: 'Channel ID', value: channelId, inline: true },
					{ name: 'Channel Name', value: channelName, inline: true },
				);

				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({
						embeds: [successEmbed],
						flags: 64,
					});
				}
				else {
					await interaction.reply({
						embeds: [successEmbed],
						flags: 64,
					});
				}
			}
		}
		else {
			try {
				await sendErrorMessage(interaction, {
					'Command Name': interaction.commandName,
					'Error Details': error_message,
				});
			}
			catch (sendError) {
				console.error('Error | Failed to send error message:', sendError?.message || sendError);
			}
		}
	},
};