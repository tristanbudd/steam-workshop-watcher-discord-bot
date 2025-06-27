const { getChannelNotifications, removeAllNotifications } = require('../modules/common');
const { sendErrorMessage } = require('../modules/error');

const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('remove-all-update')
		.setDescription('Remove all automatic updater notifications from this channel. (Requires Administrator)'),
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

		const guildId = interaction.guildId;
		const channelId = interaction.channelId;
		const channelName = interaction.channel.name;

		const channelNotifications = getChannelNotifications(interaction.guildId, interaction.channelId);
		if (channelNotifications.filter(n => n.type === 'addon-update').length < 1 || channelNotifications.filter(n => n.type === 'collection-update').length < 1) {
			error_count += 1;
			error_message = 'There are no automatic updater notifications in this channel to remove.';
		}

		if (error_count < 1) {
			removeAllNotifications(guildId, channelId);

			const successEmbed = new EmbedBuilder()
				.setTitle('All Auto Updater Notification Removed')
				.setDescription('All automatic updater notifications have been successfully removed from this channel.')
				.setColor('#00FF00')
				.setFooter({
					text: interaction.client.user.displayName,
					iconURL: interaction.client.user.displayAvatarURL(),
				})
				.setTimestamp();

			successEmbed.addFields(
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