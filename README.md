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

Please refer to [setup.md](docs/setup.md).

## Automations and dashboards

Refer to [hass.md](docs/hass.md) for details.

# Development

See [dev.md](docs/dev.md) for development notes.
