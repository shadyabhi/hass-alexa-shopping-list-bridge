# Amazon Shopping List Bridge

Amazon/Alexa doesn't provide any official API for integrating Alexa shopping lists with Home Assistant.

This Home Assistant add-on implements that functionality, but since there is no official API, we do that by pretending to be a browser.

This is done by using the following technologies:

- Playwright: For browser automation
- Playwright-stealth: For stealth mode, with some overrides wherever needed
- Home Assistant API: Allows the add-on to push updates to Home Assistant.

## Features

- Syncs shopping list from Amazon to Home Assistant
- All configuration is done in UI.
- Initial setup is needed for first-time login, or when Amazon invalides the cookies.

## Setup

The whole process is smooth once you obtain the cookies. To obtain cookies, you need to do the first-run manually on your laptop, then copy over the cookies to the HASS addon.

### Step 1: Addon Install (don't start!)

To upload the cookies and session data for first time use, we can use this add-on to do everything in the UI.

https://my.home-assistant.io/redirect/supervisor_addon/?addon=core_samba

Once this addon is running, you can browse for local network folders, or open it in browser as:

> smb://<IP_ADDRESS_OF_HASS>

### Step 2: Configure the HASS addon

- Go to the addon page in HASS UI
- Create a new User in Home Assistant for this addon, and give it admin rights.
  - Open HASS UI
  - Go to Settings -> Users
  - Click on "Add User"
  - Fill in the details, make sure to set the password, keep it for later use
  - Ensure Admin rights, as we manage To-do lists
  - Click on "Create"
- Configure the addon with required configuration.
  - Home Assistant URL: https://<IP_ADDRESS_OF_HASS>
  - Home Assistant user: <HASS_USER>
  - Home Assistant password: <HASS_PASSWORD>
- DO NOT START!

### Step 3: Get cookies.json

> Warning!
>
> This is the hardest part. We need a local installation of Playright on our laptop/desktop to get the cookies for the first time.
>
> I plan to improve this workflow in a future release.

- Install playright, follow official documentation. https://playwright.dev/docs/intro#installing-playwright
- Clone this repository locally.
- Create a local config file, `config.hjson`

```hjson
{
    # Home Assistant configuration
    hass: {
        # Make sure this matches your home assistant URL
        base_url: "http://192.168.1.208:8123"

        # Username/password from previous step
        # This is used to update the shopping list in Home Assistant
        username: "shopping_list_alexa"
        password: "secret_pass"
    }
}
```

- Run the following command:

```bash
# Syncs all dependencies
npm ci

# headless mode can't perform browser login, so user can enter username/password
APP_HEADLESS_ONLY=false node main.js

# Once the above command is done, it will save the cookies to `data/session_config.json`.
```
- Copy the `data/session_config.json` to the HASS addon folder `data/session_config.json`.
  - Open Samba share at: `smb://<IP_ADDRESS_OF_HASS>`, for me, its as easy as: `smb://homeassistant.local`
  - Open folder `addons_configs`
  - Locate the addon folder inside it.
  - Copy the local `data/session_config.json` to the addon config folder `session_config.json`.

### Step 4: Start the addon

- Go to the addon page in HASS UI
- Start the addon
- Observe logs

# Development

See [DEV.md](DEV.md) for development notes.
