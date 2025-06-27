const { EmbedBuilder } = require('discord.js');

async function sendErrorMessage(interaction, errorDetails) {
	if (!interaction.isRepliable()) {
		console.warn('Warning | Attempted to reply to an expired or invalid interaction.');
		return;
	}

	const errorEmbed = new EmbedBuilder()
		.setTitle('An Error Has Occurred!')
		.setDescription('An error occurred while trying to execute this command. Please try again later or contact support if the issue persists.')
		.setColor('#FF0000')
		.setFooter({
			text: interaction.client.user.displayName,
			iconURL: interaction.client.user.displayAvatarURL(),
		})
		.setTimestamp();

	if (errorDetails) {
		for (const [key, value] of Object.entries(errorDetails)) {
			if (value) {
				errorEmbed.addFields({ name: key, value: `\`${value}\`` });
			}
		}
	}

	try {
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({
				embeds: [errorEmbed],
				flags: 64,
			});
		}
		else {
			await interaction.reply({
				embeds: [errorEmbed],
				flags: 64,
			});
		}
	}
	catch (error) {
		if (error.code === 40060) {
			console.warn('Warning | Attempted to send error message but interaction was already replied to.');
		}
		else {
			console.error('Error | Failed to send error message:', error?.message || error);
		}
	}
}

module.exports = {
	sendErrorMessage,
};