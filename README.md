# Steam Workshop Watcher Discord Bot
![](https://img.shields.io/github/stars/tristanbudd/steam-workshop-watcher-discord-bot.svg) ![](https://img.shields.io/github/forks/tristanbudd/steam-workshop-watcher-discord-bot.svg) ![](https://img.shields.io/github/issues/tristanbudd/steam-workshop-watcher-discord-bot.svg)

## What does this do?
This Discord bot monitors Steam Workshop addons and collections for updates and automatically posts update notifications to specified Discord channels.

It allows you to track workshop items in real-time, making it easy for communities, developers, and teams to stay informed about changes to their favorite addons or collections.

---

## Features
- Monitors **Steam Workshop addons and collections** for updates.
- Sends automatic update notifications to specified Discord channels.
- Supports **per-channel subscription limits**:  
  - 3 collections per channel  
  - 5 addons per channel
- Extensive input validation and user feedback.
- Interactive confirmation for subscription commands.
- Easy `.env` configuration for both **single-server** and **global deployments**.

---

## Commands
| Command                              | Description                                                           |
|--------------------------------------|-----------------------------------------------------------------------|
| `/item-info [id] [addon/collection]` | Displays information about the Steam Workshop item or collection.     |
| `/update-history [id]`               | Shows the update history of an addon. *(Addons only, not collections)*|
| `/add-addon-update [id]`             | Adds an automatic addon update notification to the current channel.   |
| `/add-collection-update [id]`        | Adds an automatic collection update notification to the current channel. |
| `/remove-addon-update [id]`          | Removes an addon update subscription from the current channel.        |
| `/remove-collection-update [id]`     | Removes a collection update subscription from the current channel.    |
| `/remove-all-update`                 | Removes **all** addon and collection update subscriptions from the channel. |

---

## Command Previews
Here are some example usages of the bot’s commands and the update notifications:

### `/item-info` (Addon Example)
![Item Info Addon](https://github.com/user-attachments/assets/8fe91f98-32e6-4fed-8c3e-85da7711576c)

### `/item-info` (Collection Example)
![Item Info Collection](https://github.com/user-attachments/assets/3a4ea083-ae17-47ff-9d9f-c35d249ed6d3)

### `/update-history`
![Update History](https://github.com/user-attachments/assets/0f778d12-fb35-4a61-b465-f256956b1016)

### `/add-addon-update & /add-collection-update` Confirmation
![Add Addon / Collection Confirmation](https://github.com/user-attachments/assets/6364c24a-e5c3-4246-8156-48149d819983)

### Automatic Update Notification Example
![Auto Update Example](https://github.com/user-attachments/assets/61dffbf5-2de4-4fa2-bcd8-8536b3b6858e)

---

## Setup

### Requirements
- Node.js
- A Discord bot token
- A Steam API key

### `.env` Configuration
```dotenv
USE_GLOBAL=false # Set to true to use the bot in multiple servers
BOT_TOKEN=your-discord-bot-token
CLIENT_ID=your-discord-client-id
GUILD_ID=your-discord-guild-id # Only needed if USE_GLOBAL is false
STEAM_API_KEY=your-steam-api-key # Get it from https://steamcommunity.com/dev/apikey
```

---

## Notes
- **Per-Channel Limits:** Maximum of 3 collections and 5 addons tracked per channel.
- **Validation:** Each command includes thorough validation and user-friendly error messages.
- **Confirmation Prompts:** Adding update subscriptions requires confirmation to prevent accidental subscriptions.

---

## Discord Bot Deployment
- Recommended: Use **PM2** or a similar process manager to keep your bot running.
- Supports both **guild-specific** and **global commands** based on the `USE_GLOBAL` setting.

---

## Support
If you encounter issues or need help, please open an issue on GitHub:  
[https://github.com/tristanbudd/steam-workshop-watcher-discord-bot/issues](https://github.com/tristanbudd/steam-workshop-watcher-discord-bot/issues)

---

## License
[MIT](LICENSE)
