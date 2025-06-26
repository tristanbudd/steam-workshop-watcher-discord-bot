/**
 * @file update-history.js
 * Handles the '/update-history' command for Discord.
 *
 * This command allows users to view the update history of a Steam Workshop Addon.
 */

const cheerio = require('cheerio');

const { sendErrorMessage } = require('../modules/error');
const { SlashCommandBuilder, MessageFlags, EmbedBuilder} = require('discord.js');
const {getAccountDetails, getGameDetails} = require("../modules/common");
const {truncate} = require("../modules/formatting");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('update-history')
        .setDescription('Shows the update history of a Steam Workshop Addon.')

        .addStringOption(option =>
            option.setName('id')
                .setDescription('The ID of the Steam Workshop Addon. (Collections Not Supported)')
                .setRequired(true)
                .setMaxLength(20)
                .setMinLength(1)
                .setAutocomplete(false)),
    async execute(interaction) {
        let error_count = 0;
        let error_message = "";

        const id = interaction.options.getString('id');
        if (!id) {
            error_count += 1;
            error_message = "The ID of the Steam Workshop Addon is required. (Collections Not Supported)";
        }

        if (id && (id.length < 1 || id.length > 20)) {
            error_count += 1;
            error_message = "The ID must be between 1 and 20 characters long.";
        }

        if (id && !/^\d+$/.test(id)) {
            error_count += 1;
            error_message = "The ID must be a valid numeric Steam Workshop ID.";
        }

        let embedData = null;

        const params = new URLSearchParams();
        params.append('itemcount', '1');
        params.append('publishedfileids[0]', id);

        const response = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
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
            error_message = "No details found for the provided ID or the ID is invalid.";
        } else {
            const fileDetails = data.response.publishedfiledetails[0];

            if (
                !fileDetails.publishedfileid ||
                fileDetails.publishedfileid !== id ||
                fileDetails.result === undefined
            ) {
                error_count += 1;
                error_message = "No details found for the provided ID or the ID is invalid.";
            }

            if (Object.keys(data.response.publishedfiledetails[0]).length < 3) {
                error_count += 1;
                error_message = "No details found for the provided ID or the ID is invalid.";
            }
        }

        const fileDetails = data.response.publishedfiledetails[0];
        const title = `${fileDetails.title || 'Item Information'} (${id})`;

        const steamId64 = fileDetails.creator || '0';
        let accountDetails = null;

        if (error_count < 1) {
            try {
                accountDetails = await getAccountDetails(steamId64);
            } catch (err) {
                console.error(`Error | Failed to fetch Steam account details: ${err.message}`);
            }
        }

        let changeNotes = [];
        const url = `https://steamcommunity.com/sharedfiles/filedetails/changelog/${id}`;

        try {
            const response = await fetch(url);
            const html = await response.text();

            const $ = cheerio.load(html);

            $('.detailBox.workshopAnnouncement.noFooter.changeLogCtn').each((i, elem) => {
                const updateTime = $(elem).find('.changelog.headline').text().trim();

                let changeNote = $(elem).find('p').text().trim();
                if (!changeNote) {
                    changeNote = '[No changelog provided]';
                }

                changeNotes.push({
                    updateTime: updateTime,
                    changeNote: changeNote
                });
            });
        } catch (err) {
            error_count += 1;
            error_message = `An error occurred while fetching the update history: ${err.message}`;
            console.error(`Error | Failed to fetch update history for ID ${id}:`, err);
        }

        if (error_count === 0) {
            embedData = new EmbedBuilder()
                .setTitle(title)
                .setColor('#3C3C3C')
                .setThumbnail(fileDetails.preview_url || 'https://cdn.discordapp.com/embed/avatars/0.png')
                .setFooter({
                    text: interaction.client.user.displayName,
                    iconURL: interaction.client.user.displayAvatarURL()
                })
                .setURL(`https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`)
                .setTimestamp();

            const totalChanges = changeNotes.length;
            const limitedChanges = changeNotes.slice(0, 10);

            limitedChanges.forEach((change, index) => {
                let name = `${change.updateTime}`;
                if (index === 0) name += ' (Latest)';
                if (index === limitedChanges.length - 1 && limitedChanges.length > 1) name += ' (Oldest)';

                embedData.addFields({
                    name: name,
                    value: truncate(change.changeNote, 512)
                });
            });

            embedData.setDescription(`Here is the update history for ${fileDetails.title || 'Item Information'}:\n-# Total Changes: ${totalChanges}\n-# Displayed Changes (10 Limit): ${limitedChanges.length}`);

            if (accountDetails) {
                embedData.setAuthor({
                    name: accountDetails.personaname || 'Unknown Creator',
                    iconURL: accountDetails.avatarfull || 'https://cdn.discordapp.com/embed/avatars/0.png',
                    url: accountDetails.profileurl || 'https://steamcommunity.com/id/' + steamId64
                });
            }

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    embeds: [embedData],
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply({
                    embeds: [embedData],
                    flags: MessageFlags.Ephemeral
                });
            }
        } else {
            await sendErrorMessage(interaction, {
                "Command Name": interaction.commandName,
                "Error Details": error_message || 'An unknown error occurred.',
            });
        }
    },
};