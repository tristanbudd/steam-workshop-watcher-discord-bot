/**
 * @file add-addon-update.js
 * Handles the '/add-addon-update' command for Discord.
 *
 * This command allows users to add an automatic addon updater notification to a channel.
 */

const { sendConfirmationDialogue, isNotification, addNotification, getChannelNotifications } = require('../modules/common');
const { sendErrorMessage } = require('../modules/error');

const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('add-addon-update')
		.setDescription('Add an automatic addon updater notification to this channel. (Requires Administrator)')

		.addStringOption(option =>
			option.setName('id')
				.setDescription('The ID of the Steam Workshop Addon.')
				.setRequired(true)
				.setMaxLength(20)
				.setMinLength(1)
				.setAutocomplete(false)),
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
			error_message = 'The ID of the Steam Workshop Addon is required.';
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

		const addonChannelLimit = 5;
		const channelNotifications = getChannelNotifications(interaction.guildId, interaction.channelId);
		if (channelNotifications.filter(n => n.type === 'addon-update').length >= addonChannelLimit) {
			error_count += 1;
			error_message = `This channel already has the maximum number of addon updater notifications (${addonChannelLimit}). Please remove an existing notification before adding a new one.`;
		}

		if (error_count < 1) {
			const guildId = interaction.guildId;
			const channelId = interaction.channelId;
			const channelName = interaction.channel.name;

			if (await sendConfirmationDialogue(interaction, 'Addon Update Notification Confirmation', 'You are about to set up and addon auto-updater notification to this channel.\n\nDo you want to proceed?', {
				'Addon ID': id,
				'Channel ID': channelId,
				'Channel Name': channelName,
				'Type': 'Addon Update',
			}, 'add-addon-update-confirmation')) {
				if (isNotification(guildId, channelId, 'addon-update', id)) {
					try {
						await sendErrorMessage(interaction, {
							'Command Name': interaction.commandName,
							'Error Details': 'An addon update notification for this ID already exists in this channel.',
						});
					}
					catch (sendError) {
						console.error('Error | Failed to send error message:', sendError?.message || sendError);
					}
					return;
				}

				addNotification(guildId, channelId, 'addon-update', id);

				const successEmbed = new EmbedBuilder()
					.setTitle('Auto Updater Notification Added')
					.setDescription('An automatic addon updater notification has been successfully added to this channel.')
					.setColor('#00FF00')
					.setFooter({
						text: interaction.client.user.displayName,
						iconURL: interaction.client.user.displayAvatarURL(),
					})
					.setTimestamp();

				successEmbed.addFields(
					{ name: 'Addon ID', value: id, inline: true },
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