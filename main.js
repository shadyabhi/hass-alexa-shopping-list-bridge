const config = require('./config');
const HomeAssistantClient = require('./hass_client');
const ShoppingList = require('./shopping_list');
const logger = require('./logger').child({ label: 'Main' });


(async () => {
    try {
        config.validate();

        const shoppingList = new ShoppingList();
        shoppingList.preflight();

        const hassClient = new HomeAssistantClient(config.hass);

        while (true) {
            await shoppingList.browserStart(async (data) => {
                // This callback is triggered whenever fresh data is intercepted
                try {
                    await shoppingList.sync(hassClient, data);
                } catch (error) {
                    logger.error('Error during sync callback:', error);
                }
            });

            // Calculate delay with jitter
            const restartSeconds = config.amazon.force_restart_browser_seconds;
            const jitterSeconds = config.amazon.force_restart_browser_jitter;
            const jitter = Math.floor(Math.random() * (jitterSeconds + 1));
            const delayInSeconds = restartSeconds + jitter;

            logger.info(`Browser monitoring active. Next restart in ${delayInSeconds}s (Base: ${restartSeconds}, Jitter: ${jitter})`);

            // Wait for the duration
            await new Promise(resolve => setTimeout(resolve, delayInSeconds * 1000));

            logger.info('Stopping browser for scheduled restart...');
            await shoppingList.browserClose();
        }

    } catch (error) {
        logger.error('Main task loop failed:', error);
        process.exit(1);
    }
})();
