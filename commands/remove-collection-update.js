const {removeNotification, isNotification, getChannelNotifications} = require("../modules/common");
const {sendErrorMessage} = require("../modules/error");

const {SlashCommandBuilder, PermissionsBitField, EmbedBuilder} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove-collection-update')
        .setDescription('Remove an automatic collection updater notification to this channel. (Requires Administrator)')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('The ID of the Steam Workshop Collection.')
                .setRequired(true)
                .setMaxLength(20)
                .setMinLength(1)
                .setAutocomplete(true)),
    async autocomplete(interaction) {
        try {
            const focusedValue = interaction.options.getFocused();
            const channelNotifications = getChannelNotifications(interaction.guildId, interaction.channelId);

            const targetUpdates = channelNotifications.filter(n => n.type === 'collection-update');

            const filtered = targetUpdates.filter(n =>
                n.id.startsWith(focusedValue) ||
                (n.name && n.name.toLowerCase().includes(focusedValue.toLowerCase()))
            ).slice(0, 25);

            await interaction.respond(
                filtered.map(n => ({
                    name: n.name ? `${n.name} (${n.id})` : n.id,
                    value: n.id
                }))
            );
        } catch (error) {
            console.error('Error | Error in autocomplete for remove-collection-update:', error);
        }
    },
    async execute(interaction) {
        let error_count = 0;
        let error_message = "";

        if (
            !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
            interaction.guild.ownerId !== interaction.user.id
        ) {
            error_count += 1;
            error_message = "You must have Administrator permissions or be the Server Owner to use this command.";
        }

        const id = interaction.options.getString('id');
        if (!id) {
            error_count += 1;
            error_message = "The ID of the Steam Workshop Collection is required.";
        }

        if (id && (id.length < 1 || id.length > 20)) {
            error_count += 1;
            error_message = "The ID must be between 1 and 20 characters long.";
        }

        if (id && !/^\d+$/.test(id)) {
            error_count += 1;
            error_message = "The ID must be a valid numeric Steam Workshop ID.";
        }

        const guildId = interaction.guildId;
        const channelId = interaction.channelId;
        const channelName = interaction.channel.name;

        if (!isNotification(guildId, channelId, "collection-update", id)) {
            error_count += 1;
            error_message = `No automatic collection updater notification found for ID \`${id}\` in this channel.`;
        }

        if (error_count < 1) {
            removeNotification(guildId, channelId, "collection-update", id);

            const successEmbed = new EmbedBuilder()
                .setTitle('Auto Updater Notification Removed')
                .setDescription('The automatic collection updater notification has been successfully removed from this channel.')
                .setColor('#00FF00')
                .setFooter({
                    text: interaction.client.user.displayName,
                    iconURL: interaction.client.user.displayAvatarURL()
                })
                .setTimestamp();

            successEmbed.addFields(
                { name: 'Collection ID', value: id, inline: true },
                { name: 'Channel ID', value: channelId, inline: true },
                { name: 'Channel Name', value: channelName, inline: true }
            );

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    embeds: [successEmbed],
                    flags: 64
                });
            } else {
                await interaction.reply({
                    embeds: [successEmbed],
                    flags: 64
                });
            }
        } else {
            try {
                await sendErrorMessage(interaction, {
                    "Command Name": interaction.commandName,
                    "Error Details": error_message
                })
            } catch (sendError) {
                console.error('Error | Failed to send error message:', sendError?.message || sendError);
            }
        }
    }
};