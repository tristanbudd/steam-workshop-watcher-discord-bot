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

    } catch (err) {
        console.error(`Error | An exception occurred while fetching Steam account details: ${err.message}`);
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

module.exports = {
    getAccountDetails,
    getGameDetails
};