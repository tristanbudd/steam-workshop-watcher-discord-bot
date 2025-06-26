/**
 * @file item-info.js
 * Handles the '/item-info' command for Discord.
 *
 * This command allows users to view the basic information of a Steam Workshop Addon or Collection.
 */

const { sendErrorMessage } = require('../modules/error');
const { getAccountDetails, getGameDetails } = require('../modules/common');
const { steamToDiscordFormatting, truncate } = require('../modules/formatting');

const { SlashCommandBuilder, MessageFlags, EmbedBuilder} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('item-info')
        .setDescription('Shows the update history of a Steam Workshop Addon or Collection.')

        .addStringOption(option =>
            option.setName('id')
                .setDescription('The ID of the Steam Workshop Addon or Collection.')
                .setRequired(true)
                .setMaxLength(20)
                .setMinLength(1)
                .setAutocomplete(false))

        .addStringOption(option =>
            option.setName('type')
                .setDescription('The type of the item (Addon or Collection).')
                .setRequired(true)
                .addChoices(
                    { name: 'Addon', value: 'addon' },
                    { name: 'Collection', value: 'collection' }
                )),
    async execute(interaction) {
        let error_count = 0;
        let error_message = "";

        const id = interaction.options.getString('id');
        if (!id) {
            error_count += 1;
            error_message = "The ID of the Steam Workshop Addon or Collection is required.";
        }

        if (id && (id.length < 1 || id.length > 20)) {
            error_count += 1;
            error_message = "The ID must be between 1 and 20 characters long.";
        }

        if (id && !/^\d+$/.test(id)) {
            error_count += 1;
            error_message = "The ID must be a valid numeric Steam Workshop ID.";
        }

        const type = interaction.options.getString('type');
        if (!type || (type !== 'addon' && type !== 'collection')) {
            error_count += 1;
            error_message = "The type of the item must be either 'Addon' or 'Collection'.";
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
        const description = steamToDiscordFormatting(fileDetails.description || 'No description available.', 512);

        const steamId64 = fileDetails.creator || '0';
        let gameId
        if (type === 'addon') {
            gameId = fileDetails.creator_app_id || '0';
        } else {
            gameId = fileDetails.consumer_app_id || '0';
        }
        let accountDetails = null;
        let gameDetails = null;

        if (error_count < 1) {
            try {
                accountDetails = await getAccountDetails(steamId64);
            } catch (err) {
                console.error(`Error | Failed to fetch Steam account details: ${err.message}`);
            }

            try {
                gameDetails = await getGameDetails(gameId);
            } catch (err) {
                console.error(`Error | Failed to fetch game details: ${err.message}`);
            }
        }

        const gameName = gameDetails ? gameDetails.name : 'Unknown Game';

        if (type === 'addon') {
            embedData = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor('#3C3C3C')
                .setThumbnail(fileDetails.preview_url || 'https://cdn.discordapp.com/embed/avatars/0.png')
                .setFooter({
                    text: interaction.client.user.displayName,
                    iconURL: interaction.client.user.displayAvatarURL()
                })
                .setURL(`https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`)
                .addFields(
                    {name: 'Game', value: `${gameName} (${gameId})`, inline: true},
                    { name: 'Visibility', value: fileDetails.visibility === 0 ? 'Public' : fileDetails.visibility === 1 ? 'Friends Only' : 'Private', inline: true },
                    { name: 'File Size', value: `${(fileDetails.file_size / 1024 / 1024).toFixed(2)} MB`, inline: true },
                    { name: 'Subscriptions', value: fileDetails.subscriptions ? fileDetails.subscriptions.toLocaleString() : '0', inline: true },
                    { name: 'Favorites', value: fileDetails.favorited ? fileDetails.favorited.toLocaleString() : '0', inline: true },
                    { name: 'Views', value: fileDetails.views ? fileDetails.views.toLocaleString() : '0', inline: true },
                    { name: 'Created', value: new Date(fileDetails.time_created * 1000).toLocaleDateString(), inline: true },
                    { name: 'Updated', value: new Date(fileDetails.time_updated * 1000).toLocaleDateString(), inline: true },
                    { name: 'Tags', value: fileDetails.tags && fileDetails.tags.length > 0 ? fileDetails.tags.map(tag => `\`${truncate(tag.tag, 20)}\``).join(', ') : 'No tags available', inline: false }
                )
                .setTimestamp();

            if (accountDetails) {
                embedData.setAuthor({
                    name: accountDetails.personaname || 'Unknown Creator',
                    iconURL: accountDetails.avatarfull || 'https://cdn.discordapp.com/embed/avatars/0.png',
                    url: accountDetails.profileurl || 'https://steamcommunity.com/id/' + steamId64
                });
            }
        } else if (type === 'collection') {
            const params = new URLSearchParams();
            params.append('collectioncount', '1');
            params.append('publishedfileids[0]', id);

            const response = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetCollectionDetails/v1/', {
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
                !data.response.collectiondetails ||
                data.response.collectiondetails.length === 0
            ) {
                error_count += 1;
                error_message = "No details found for the provided ID or the ID is invalid. (Keep in mind collections must be public)";
            } else {
                const collectionDetails = data.response.collectiondetails[0];

                if (
                    !collectionDetails.publishedfileid ||
                    collectionDetails.publishedfileid !== id ||
                    collectionDetails.result === undefined
                ) {
                    error_count += 1;
                    error_message = "No details found for the provided ID or the ID is invalid. (Keep in mind collections must be public)";
                }
            }

            const collectionDetails = data.response.collectiondetails[0].children;

            embedData = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor('#3C3C3C')
                .setThumbnail(fileDetails.file_url || 'https://cdn.discordapp.com/embed/avatars/0.png')
                .setFooter({
                    text: interaction.client.user.displayName,
                    iconURL: interaction.client.user.displayAvatarURL()
                })
                .setURL(`https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`)
                .addFields(
                    {name: 'Game', value: `${gameName} (${gameId})`, inline: true},
                    { name: 'Visibility', value: fileDetails.visibility === 0 ? 'Public' : fileDetails.visibility === 1 ? 'Friends Only' : 'Private', inline: true },
                    { name: 'Favorites', value: fileDetails.favorited ? fileDetails.favorited.toLocaleString() : '0', inline: true },
                    { name: 'Views', value: fileDetails.views ? fileDetails.views.toLocaleString() : '0', inline: true },
                    { name: 'Created', value: new Date(fileDetails.time_created * 1000).toLocaleDateString(), inline: true },
                    { name: 'Updated', value: new Date(fileDetails.time_updated * 1000).toLocaleDateString(), inline: true },
                    { name: 'Item Count', value: collectionDetails.length.toString(), inline: true },
                )
                .setTimestamp();

            if (accountDetails) {
                embedData.setAuthor({
                    name: accountDetails.personaname || 'Unknown Creator',
                    iconURL: accountDetails.avatarfull || 'https://cdn.discordapp.com/embed/avatars/0.png',
                    url: accountDetails.profileurl || 'https://steamcommunity.com/id/' + steamId64
                });
            }
        }

        if (error_count === 0) {
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