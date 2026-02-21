const fs = require('fs');
const config = require('./config');
const BrowserState = require('./browser_state');
const logger = require('./logger').child({ label: 'ShoppingList' });

const SHOPPING_LIST_API_URL = '/alexashoppinglists/api/getlistitems';
const DEBUG_URLS = [
    SHOPPING_LIST_API_URL,
    '/ap/signin',
    '/gp/alexa-shopping-list'
];

class ShoppingList {
    constructor() {
        this.browserState = new BrowserState();
    }

    preflight() {
        // Simple check: if headless_only is true and no cookies exist, we can't properly start.
        // However, getAuthenticatedPage() also checks this, so we could technically remove this
        // or just keep it as an early fail.
        if (config.app.headless_only && !fs.existsSync(this.browserState.sessionConfigPath)) {
            throw new Error(`No session found at location ${this.browserState.sessionConfigPath}. headless_only is enabled — cannot initiate login flow.`);
        }
    }

    async browserStart(callback) {
        logger.info('Starting Shopping List Monitoring...');

        let page;
        try {
            page = await this.browserState.getAuthenticatedPage();
        } catch (e) {
            logger.error(`Failed to initialize browser: ${e.message}`);
            throw e;
        }

        // Setup response listener
        page.on('response', async response => {
            const url = response.url();
            const shouldLog = DEBUG_URLS.some(debugUrl => url.includes(debugUrl));

            if (shouldLog) {
                await this._logResponseDetails(response);
            }

            if (url.includes(SHOPPING_LIST_API_URL) && response.status() === 200) {
                try {
                    const responseBodyText = await response.text();
                    const data = JSON.parse(responseBodyText);
                    logger.info(`Received shopping list data from intercepted request: ${url}`);

                    if (callback) {
                        await callback(data);
                    }
                } catch (err) {
                    logger.error('Error parsing shopping list response:', err);
                }
            }
        });

        // Navigate to the shopping list page
        try {
            const navUrl = `https://${this.browserState.domain}/gp/alexa-shopping-list`;
            logger.info(`Navigating to Shopping List page: ${navUrl}`);
            await page.goto(navUrl, {
                waitUntil: 'networkidle'
            });
        } catch (e) {
            logger.error('Error navigating to shopping list page:', e);
        }

        // Check if we were redirected to login (session expired despite cookie file existing)
        if (page.url().includes('signin')) {
            logger.info('Session expired (redirected to signin).');
            if (config.app.headless_only) {
                throw new Error('Cookies expired. headless_only is enabled — cannot initiate login flow.');
            }

            logger.info('Restarting browser in headful mode for login...');
            await this.browserState.close();

            // Delete stale session so getAuthenticatedPage triggers login
            if (fs.existsSync(this.browserState.sessionConfigPath)) {
                fs.unlinkSync(this.browserState.sessionConfigPath);
            }

            // Recursive retry (now that cookies are gone, it will trigger login)
            return this.browserStart(callback);
        }

        logger.info('Monitoring started.');
    }

    async browserClose() {
        await this.browserState.close();
    }


    async sync(hassClient, data) {
        logger.debug('Processing synced data...');

        if (!data) {
            logger.error('No data available to sync.');
            return;
        }

        for (const listId in data) {
            const listData = data[listId];
            if (!listData.listInfo) continue;

            const listName = listData.listInfo.listName || 'Shopping List';
            const listType = listData.listInfo.listType || 'SHOPPING_LIST';
            const haListName = `Amazon_${listName}.${listType}`;

            const itemCount = (listData.listItems || []).length;
            logger.info(`Processing list: ${haListName} (Total items in Amazon list: ${itemCount})`);

            try {
                const haEntityId = await hassClient.ensureToDoList(haListName);
                const activeItems = (listData.listItems || []).filter(item => !item.completed);
                await hassClient.syncItems(haEntityId, activeItems);
            } catch (error) {
                logger.error(`Failed to sync list ${haListName}:`, error.message);
            }
        }
    }

    async _logResponseDetails(response) {
        try {
            const requestHeaders = await response.request().allHeaders();
            const responseHeaders = await response.allHeaders();
            let responseBodyText = '';

            try {
                // Some redirects or static assets might not have a text body or might fail to buffer
                responseBodyText = await response.text();
            } catch (e) {
                responseBodyText = `[Error reading body: ${e.message}]`;
            }

            logger.debug(`--- Intercepted: ${response.url()} ---`);
            logger.debug(`Status: ${response.status()}`);
            logger.debug(`Request Headers: ${JSON.stringify(requestHeaders, null, 2)}`);
            logger.debug(`Response Headers: ${JSON.stringify(responseHeaders, null, 2)}`);
            // Limit body logging to avoid massive spam for full HTML pages, unless it's the API
            if (responseBodyText.length > 5000 && !response.url().includes(SHOPPING_LIST_API_URL)) {
                logger.debug(`Response Body: ${responseBodyText.substring(0, 500)}... [Truncated ${responseBodyText.length} chars]`);
            } else {
                logger.debug(`Response Body: ${responseBodyText}`);
            }
            logger.debug('-------------------------------------');
        } catch (err) {
            logger.error(`Error logging details for ${response.url()}:`, err);
        }
    }
}

module.exports = ShoppingList;
