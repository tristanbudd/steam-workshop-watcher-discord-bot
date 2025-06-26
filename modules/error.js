const {EmbedBuilder, MessageFlags} = require("discord.js");

async function sendErrorMessage(interaction, errorDetails) {
    const errorEmbed = new EmbedBuilder()
        .setTitle('An Error Has Occurred!')
        .setDescription('An error occurred while trying to execute this command. Please try again later or contact support if the issue persists.')
        .setColor('#FF0000')
        .setFooter({
            text: interaction.client.user.displayName,
            iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

    if (errorDetails) {
        for (const [key, value] of Object.entries(errorDetails)) {
            if (value) {
                errorEmbed.addFields({name: key, value: `\`${value}\``});
            }
        }
    }

    if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
            embeds: [errorEmbed],
            flags: MessageFlags.Ephemeral
        });
    } else {
        await interaction.reply({
            embeds: [errorEmbed],
            flags: MessageFlags.Ephemeral
        });
    }
}

module.exports = {
    sendErrorMessage
}