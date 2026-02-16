# Setup

The whole process is smooth once you obtain the cookies. To obtain cookies, you need to do the first-run manually on your laptop, then copy over the cookies to the HASS addon.

### Step 1: Addon Install (don't start!)

- Install `Samba addon` in HASS
  - To upload the cookies and session data for first time use, we can use this addon to do everything in the UI.
  - https://my.home-assistant.io/redirect/supervisor_addon/?addon=core_samba
  - Once this addon is running, you can browse for local network folders, or open it in browser as:
    - smb://<IP_ADDRESS_OF_HASS>, in my case, it was as simple as: `smb://homeassistant.local`.
- Start the addon, enable a password so its not available to local network without a password.

- Add `Local To-do` integration in HASS: https://www.home-assistant.io/integrations/local_todo/

- Under `Settings -> Addons`, click on `Addons` in the left sidebar.
  - Click on `Add` button.
  - Click on `Install App -> Upper top right corner -> Custom Repositories`.
  - Add the repository URL: `https://github.com/shadyabhi/amazon_shopping_list`
  - Now, Search for `Amazon Shopping List Bridge`.
  - Click on `Install` button.
  - DO NOT START!

<img width="783" height="313" alt="image" src="https://github.com/user-attachments/assets/6845dfdb-b219-4632-841e-2ee9fe7f2fb2" />

### Step 2: Configure addon

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
 
<img width="1081" height="1134" alt="image" src="https://github.com/user-attachments/assets/376e4a51-e801-4f84-98e5-6d683c980626" />


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

<img width="944" height="817" alt="image" src="https://github.com/user-attachments/assets/ded69f69-a62c-4e0b-ab5b-7990b126147a" />

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
