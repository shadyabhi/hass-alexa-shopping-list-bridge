const logger = require('./logger').child({ label: 'HomeAssistantClient' });
const CLIENT_ID = 'https://home-assistant.io/android';
const REDIRECT_URI = 'homeassistant://auth-callback';

class HomeAssistantClient {
    constructor(config) {
        this.baseUrl = config.base_url;
        this.username = config.username;
        this.password = config.password;
        this.token = null;
    }

    /**
     * Authenticated fetch wrapper. Automatically triggers login if no token is present.
     * Retries are enabled for network errors and 401/5xx HTTP errors.
     */
    async fetchAPI(endpoint, method = 'GET', body = null, retry = true) {
        if (!this.token) {
            logger.info('No token found. Attempting to login...');
            await this.login();
        }

        const url = `${this.baseUrl}${endpoint}`;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`,
            },
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        logger.debug(`fetchAPI: ${method} ${url}`);

        let response;
        try {
            response = await fetch(url, options);
        } catch (err) {
            if (retry) {
                logger.warn(`Network error during ${method} ${endpoint}: ${err.message}. Retrying...`);
                return this.fetchAPI(endpoint, method, body, false);
            }
            throw err;
        }

        if (!response.ok) {
            const text = await response.text();

            if (retry) {
                // 401: Token expired -> Refresh and retry
                if (response.status === 401) {
                    logger.warn(`Received 401 Unauthorized for ${method} ${endpoint}. Refreshing token and retrying...`);
                    this.token = null;
                    return this.fetchAPI(endpoint, method, body, false);
                }

                // 5xx: Server error -> Simple retry
                if (response.status >= 500) {
                    logger.warn(`Received ${response.status} for ${method} ${endpoint}. Retrying...`);
                    return this.fetchAPI(endpoint, method, body, false);
                }
            }

            logger.error(`HTTP ${response.status} ${response.statusText} on ${method} ${endpoint}. Body: ${text.substring(0, 200)}`);
            throw new Error(`HTTP ${response.status} ${response.statusText} on ${method} ${endpoint}: ${text}`);
        }
        return await response.json();
    }

    /**
     * Authenticates via HA's login flow and obtains an access token.
     * Uses direct fetch() to avoid recursion with fetchAPI().
     */
    async login() {
        logger.info('Initiating Login Flow...');

        const initResponse = await this._postDirect('/auth/login_flow', {
            client_id: CLIENT_ID,
            handler: ['homeassistant', null],
            redirect_uri: REDIRECT_URI
        });
        const { flow_id: flowId } = initResponse;
        logger.info(`Login Flow Initiated (Flow ID: ${flowId})`);

        const authData = await this._postDirect(`/auth/login_flow/${flowId}`, {
            username: this.username,
            password: this.password,
            client_id: CLIENT_ID
        });

        if (authData.type !== 'create_entry') {
            throw new Error(`Authentication failed. Expected 'create_entry', got '${authData.type}': ${JSON.stringify(authData)}`);
        }
        logger.info('Authentication successful. Obtained Auth Code.');

        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code: authData.result,
            client_id: CLIENT_ID,
        });
        const tokenResponse = await fetch(`${this.baseUrl}/auth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });
        if (!tokenResponse.ok) {
            const text = await tokenResponse.text();
            throw new Error(`Token exchange failed: ${tokenResponse.status} - ${text}`);
        }

        const tokenData = await tokenResponse.json();
        this.token = tokenData.access_token;
        logger.info('Access Token obtained to send data.');
        return this.token;
    }

    async findTodoEntity(targetName) {
        const states = await this.fetchAPI('/api/states');
        const match = states
            .filter(s => s.entity_id.startsWith('todo.'))
            .find(e => e.attributes.friendly_name === targetName);

        if (match) {
            logger.debug(`Found list '${targetName}': ${match.entity_id}`);
            return match.entity_id;
        }
        return null;
    }

    async ensureToDoList(listName) {
        const existing = await this.findTodoEntity(listName);
        if (existing) return existing;

        logger.info(`List '${listName}' not found. Creating...`);

        try {
            const flowInit = await this.fetchAPI('/api/config/config_entries/flow', 'POST', {
                handler: 'local_todo'
            });
            logger.info(`Config Flow Initiated: ${flowInit.flow_id}`);

            const flowResult = await this.fetchAPI(`/api/config/config_entries/flow/${flowInit.flow_id}`, 'POST', {
                todo_list_name: listName
            });

            if (flowResult.type !== 'create_entry') {
                throw new Error(`Failed to create list: ${JSON.stringify(flowResult)}`);
            }

            logger.info(`Successfully created '${listName}'.`);
            await new Promise(r => setTimeout(r, 1000)); // Wait for HA state registry

            const entityId = await this.findTodoEntity(listName);
            if (!entityId) {
                throw new Error(`List '${listName}' created but entity not found.`);
            }
            return entityId;

        } catch (error) {
            if (error.message.includes('401')) {
                logger.error(`\nPERMISSION ERROR: User '${this.username}' likely lacks Admin rights.`);
                logger.error('Non-admin users cannot create Local To-do lists via config flow.');
                logger.error('Create the list manually in HA or grant Admin rights.\n');
            }
            throw error;
        }
    }

    async getItems(entityId) {
        const response = await this.fetchAPI('/api/services/todo/get_items?return_response=true', 'POST', {
            entity_id: entityId
        });
        return response.service_response?.[entityId]?.items || [];
    }

    async addItem(entityId, name, description) {
        logger.debug(`Adding item: ${name} to ${entityId}`);
        const payload = { entity_id: entityId, item: name };
        if (description) payload.description = description;
        return await this.fetchAPI('/api/services/todo/add_item', 'POST', payload);
    }

    async updateItem(entityId, itemName, status) {
        logger.debug(`Updating item: ${itemName} in ${entityId} to ${status}`);
        return await this.fetchAPI('/api/services/todo/update_item', 'POST', {
            entity_id: entityId,
            item: itemName,
            status: status
        });
    }

    async deleteItem(entityId, itemName) {
        logger.debug(`Deleting item: ${itemName} from ${entityId}`);
        return await this.fetchAPI('/api/services/todo/remove_item', 'POST', {
            entity_id: entityId,
            item: itemName
        });
    }

    /**
     * Syncs Amazon items into a HA todo list. Items are matched by Amazon ID
     * stored in the HA item's description field.
     */
    async syncItems(entityId, amazonItems) {
        logger.debug(`Starting sync for ${entityId}...`);
        const currentItems = await this.getItems(entityId);

        // Create a map of existing HA items indexed by Amazon ID (stored in description)
        const itemsByAmazonId = new Map();
        for (const item of currentItems) {
            if (item.description) {
                itemsByAmazonId.set(item.description, item);
            }
        }

        // Log summary stats
        const amazonItemIds = new Set(amazonItems.map(i => i.id));
        let toDelete = 0;
        for (const item of currentItems) {
            if (item.description && !amazonItemIds.has(item.description)) {
                toDelete++;
            }
        }

        let toAdd = 0;
        let toUpdate = 0;
        for (const amzItem of amazonItems) {
            const existing = itemsByAmazonId.get(amzItem.id);
            if (!existing) {
                toAdd++;
            } else {
                const haStatus = existing.status;
                const amzStatus = amzItem.completed ? 'completed' : 'needs_action';
                if (haStatus !== amzStatus) {
                    toUpdate++;
                }
            }
        }
        logger.info(`Sync Plan for ${entityId}: Add=${toAdd}, Update=${toUpdate}, Delete=${toDelete}`);

        await this._syncAddedOrUpdatedItems(entityId, amazonItems, itemsByAmazonId);
        await this._syncDeletedItems(entityId, amazonItems, currentItems);
        await this._updateListAttributes(entityId, amazonItems);

        const weekdayItemsCount = amazonItems.filter(item => item.value.toLowerCase().includes('weekday')).length;
        const weekendItemsCount = amazonItems.filter(item => item.value.toLowerCase().includes('weekend')).length;
        logger.debug(`Complete for ${entityId}. Total: ${amazonItems.length} (Weekday: ${weekdayItemsCount}, Weekend: ${weekendItemsCount})`);
    }

    async _syncAddedOrUpdatedItems(entityId, amazonItems, itemsByAmazonId) {
        for (const amzItem of amazonItems) {
            const existing = itemsByAmazonId.get(amzItem.id);

            if (!existing) {
                logger.info(`Sync: Added ${amzItem.value} (ID: ${amzItem.id})`);
                await this.addItem(entityId, amzItem.value, amzItem.id);
            } else {
                const haStatus = existing.status;
                const amzStatus = amzItem.completed ? 'completed' : 'needs_action';
                if (haStatus !== amzStatus) {
                    logger.info(`Sync: Updated ${amzItem.value} (Status: ${haStatus} -> ${amzStatus})`);
                    await this.updateItem(entityId, existing.summary, amzStatus);
                }
            }
        }
    }

    async _syncDeletedItems(entityId, amazonItems, currentItems) {
        const amazonItemIds = new Set(amazonItems.map(i => i.id));
        for (const item of currentItems) {
            // Only check items that have an Amazon ID in description (managed by this script)
            if (item.description && !amazonItemIds.has(item.description)) {
                logger.info(`Sync: Deleted ${item.summary} (ID: ${item.description})`);
                await this.deleteItem(entityId, item.summary);
            }
        }
    }

    async _updateListAttributes(entityId, amazonItems) {
        const weekdayItemsCount = amazonItems.filter(item =>
            item.value.toLowerCase().includes('weekday')
        ).length;
        const weekendItemsCount = amazonItems.filter(item =>
            item.value.toLowerCase().includes('weekend')
        ).length;

        const currentState = await this.fetchAPI(`/api/states/${entityId}`);
        await this.fetchAPI(`/api/states/${entityId}`, 'POST', {
            state: currentState.state,
            attributes: {
                ...currentState.attributes,
                last_successful_sync: new Date().toString(),
                weekday_items_count: weekdayItemsCount,
                weekend_items_count: weekendItemsCount
            }
        });
        logger.info(`Attributes update complete (Weekday: ${weekdayItemsCount}, Weekend: ${weekendItemsCount})`);
    }

    /**
     * Direct POST without auth — used by login() to avoid fetchAPI() recursion.
     */
    async _postDirect(endpoint, body) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`POST ${endpoint} failed: ${response.status} - ${text}`);
        }
        return await response.json();
    }

}

module.exports = HomeAssistantClient;
