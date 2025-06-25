/**
 * @file update-history.js
 * Handles the '/update-history' command for Discord.
 *
 * This command allows users to view the update history of a Steam Workshop Addon or Collection.
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('update-history')
        .setDescription('Shows the update history of a Steam Workshop Addon or Collection.')

        .addStringOption(option =>
            option.setName('id')
                .setDescription('The ID of the Steam Workshop Addon or Collection.')
                .setRequired(true)
                .setMaxLength(20)
                .setMinLength(1)
                .setAutocomplete(true)),
    // TODO: Add more options for filtering or sorting the history.
    async execute(interaction) {
        await interaction.reply('Test Reply');
    },
};