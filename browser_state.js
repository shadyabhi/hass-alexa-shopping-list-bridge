const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger').child({ label: 'BrowserState' });

const NAV_MESSAGES = [
    { path: '/ap/signin', message: 'Login page detected. Please log in.' },
    { path: '/ax/claim', message: 'Use your device to login via passkey.' },
    { path: '/gp/alexa-shopping-list', message: 'Shopping list page is now open!!' },
    { path: '/ap/mfa', message: 'Two-factor authentication page detected. Please enter OTP.' },
    { path: '/', message: 'Home page detected.' }
];

const LOGIN_TIMEOUT_MS = 120000;
const LOGIN_SUCCESS_URL_PATTERN = 'nav.*signin$';


class BrowserState {
    constructor() {
        // This is important, we need to enforce the same user-agent as the one used for initial login
        const stealth = StealthPlugin();
        if (config.app.headless_only) {
            // UA evasion is done only when running in NON headless mode, because that's where we get session data from.
            // But, once we've the session data, we need to reliably use that sesssion, no overrides
            // Once we've the session, we don't want to touch user-agents
            stealth.enabledEvasions.delete('user-agent-override');
        }
        chromium.use(stealth);

        this.domain = config.amazon.domain;
        this.dataDir = this._ensureDataDir();

        this.sessionConfigPath = path.join(this.dataDir, 'session_config.json');
        this.sessionUserConfigPath = path.join(this.dataDir, 'session_config_user.json');
        this.browser = null;
        this.context = null;
    }

    /**
     * initializes the browser and returns an authenticated page depending on needs.
     */
    async getAuthenticatedPage() {
        const needsLogin = !fs.existsSync(this.sessionConfigPath);

        // If we need to login but are in headless_only mode, we can't proceed.
        if (needsLogin && config.app.headless_only) {
            throw new Error(`No session found at ${this.sessionConfigPath} and headless_only is enabled.`);
        }

        // Launch browser (headful if we need login, otherwise as configured)
        const headless = needsLogin ? false : config.app.headless_only;
        await this.init({ headless });

        if (!needsLogin) {
            // Restore session
            let userAgent;
            if (fs.existsSync(this.sessionUserConfigPath)) {
                try {
                    const userConfig = JSON.parse(fs.readFileSync(this.sessionUserConfigPath, 'utf8'));
                    userAgent = userConfig.userAgent;
                } catch (e) {
                    logger.warn(`Failed to read user session config: ${e.message}`);
                }
            }

            if (userAgent) {
                logger.info(`Restoring User-Agent: ${userAgent}`);
            } else {
                throw new Error(`No user-agent found in session configs. Cannot initiate session without a valid user-agent.`);
            }

            try {
                this.context = await this.browser.newContext({
                    storageState: this.sessionConfigPath,
                    userAgent: userAgent
                });
                logger.info(`Session restored from ${this.sessionConfigPath}`);
            } catch (e) {
                logger.error(`Failed to restore session: ${e.message}. recreating context without state.`);
                this.context = await this.browser.newContext();
            }
        } else {
            logger.info('No session found. Initiating login flow...');
            this.context = await this.browser.newContext();
        }

        const page = await this.context.newPage();
        const ua = await page.evaluate(() => navigator.userAgent);
        logger.info(`Current User-Agent: ${ua}`);

        // Setup navigation logging
        page.on('framenavigated', (frame) => {
            if (frame === page.mainFrame()) {
                this._logNavigation(page.url());
            }
        });

        if (needsLogin) {
            await this._login(page);
        }

        // Unconditionally store state (both Playwright context and user-agent config)
        await this.storeState(page);

        return page;
    }

    async init(options = {}) {
        if (this.browser) return this.browser;

        const { deleteSession, ...launchOptions } = options;
        if (deleteSession) {
            if (fs.existsSync(this.sessionConfigPath)) {
                fs.unlinkSync(this.sessionConfigPath);
            }
            if (fs.existsSync(this.sessionUserConfigPath)) {
                fs.unlinkSync(this.sessionUserConfigPath);
            }
            logger.info('Deleted stale session config files.');
        }

        // Determine headless mode: options override config
        // Default to config.app.headless_only if not specified
        const headless = options.headless !== undefined ? options.headless : config.app.headless_only;

        this.browser = await chromium.launch({
            headless,
            // Playwright handles args well, but we can keep some if needed.
            // no-sandbox is often needed in Docker.
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            ...launchOptions
        });

        return this.browser;
    }

    // restore is now handled in getAuthenticatedPage via newContext({ storageState })
    // but we can keep a placeholder or remove it. I'll remove it as it's not standard usage pattern in playwright

    async close() {
        // Only store session if we have a context, but we don't necessarily need to update them on close
        // unless we want to capture session updates.
        // For now, let's ensure we save state if we haven't already or to capture updates.
        if (this.context) {
            await this.storeState();
            await this.context.close();
            this.context = null;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    async storeState(page) {
        // In Playwright we save storageState from context
        if (!this.context) {
            logger.error('No context to save state from.');
            return;
        }
        try {
            await this.context.storageState({ path: this.sessionConfigPath });
            logger.debug(`Session state saved to ${this.sessionConfigPath}`);

            // Save user agent if a page is provided
            if (page) {
                const userAgent = await page.evaluate(() => navigator.userAgent);
                fs.writeFileSync(this.sessionUserConfigPath, JSON.stringify({ userAgent }, null, 2));
                logger.debug(`User session config saved to ${this.sessionUserConfigPath}`);
            }
        } catch (error) {
            logger.error('Error saving session:', error.message);
        }
    }

    _ensureDataDir() {
        const dataDir = path.resolve(config.app.data_dir);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        return dataDir;
    }

    _logNavigation(url) {
        const cleanUrl = url.split('?')[0];
        let matched = false;
        try {
            const urlPath = new URL(url).pathname;
            for (const { path, message } of NAV_MESSAGES) {
                if (urlPath === path) {
                    logger.debug(`BrowserState: ${message} -> URL: ${cleanUrl}`);
                    matched = true;
                    break;
                }
            }
        } catch (error) {
            logger.error('Error parsing URL:', error.message);
        }

        if (!matched) {
            logger.debug(`BrowserState: Navigated -> URL: ${cleanUrl}`);
        }
    }

    async _login(page) {
        logger.info(`Navigating to https://${this.domain} for login...`);
        await page.goto(`https://${this.domain}`, {
            waitUntil: 'networkidle'
        });

        logger.info(`Waiting for login to complete (looking for "${LOGIN_SUCCESS_URL_PATTERN}" pattern in URL)...`);

        // Wait for usage pattern that indicates successful login
        // Playwright waitForFunction
        try {
            await page.waitForFunction(
                (pattern) => new RegExp(pattern).test(window.location.href),
                LOGIN_SUCCESS_URL_PATTERN,
                { timeout: LOGIN_TIMEOUT_MS }
            );
            logger.info(`Login detected successfully on URL ${page.url()}`);
        } catch (e) {
            logger.error(`Login timeout or error: ${e.message}`);
            throw e;
        }
    }
}

module.exports = BrowserState;
