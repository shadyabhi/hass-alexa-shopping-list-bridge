const fs = require('fs');
const path = require('path');
const hjson = require('hjson');
const Joi = require('joi');

const configSchema = Joi.object({
    app: Joi.object({
        headless_only: Joi.boolean().default(true),
        data_dir: Joi.string().default('./data'),
    }).default(),
    amazon: Joi.object({
        domain: Joi.string()
            .pattern(/^www\.amazon\./)
            .default('www.amazon.com')
            .messages({ 'string.pattern.base': '"amazon.domain" must start with "www.amazon."' }),
        force_restart_browser_seconds: Joi.number().integer().positive().default(600),
        force_restart_browser_jitter: Joi.number().integer().min(0).default(300),
    }).default(),
    hass: Joi.object({
        base_url: Joi.string().uri({ scheme: ['http', 'https'] }).default('http://homeassistant.local:8123'),
        username: Joi.string().min(1).required(),
        password: Joi.string().min(10).required(),
    }).required(),
});

class EnvVars {
    constructor(schema) {
        this._described = schema.describe();
    }

    _coerce(value, type) {
        if (type === 'boolean') return value.toLowerCase() === 'true';
        if (type === 'number') return Number(value);
        return value;
    }

    apply(data) {
        for (const [section, sectionDesc] of Object.entries(this._described.keys)) {
            if (sectionDesc.type !== 'object') continue;
            for (const [key, keyDesc] of Object.entries(sectionDesc.keys)) {
                const envName = `${section}_${key}`.toUpperCase();
                const envValue = process.env[envName];
                if (envValue !== undefined) {
                    if (!data[section]) data[section] = {};
                    data[section][key] = this._coerce(envValue, keyDesc.type);
                }
            }
        }
        return data;
    }
}


class Config {
    constructor() {
        const envVars = new EnvVars(configSchema);

        let fileData = {};
        const configPath = process.env.CONFIG || path.join(__dirname, 'config.hjson');

        if (fs.existsSync(configPath)) {
            try {
                const raw = fs.readFileSync(configPath, 'utf8');
                fileData = hjson.parse(raw);
            } catch (error) {
                throw new Error(`Failed to read config.hjson: ${error.message}`);
            }
        }

        this._data = envVars.apply(fileData);
    }

    get app() { return this._data.app; }
    get amazon() { return this._data.amazon; }
    get hass() { return this._data.hass; }

    validate() {
        const { value, error } = configSchema.validate(this._data, { abortEarly: false });
        if (error) {
            const messages = error.details.map(d => d.message).join('\n  - ');
            throw new Error(`Invalid config:\n  - ${messages}`);
        }
        this._data = value;
    }
}

module.exports = new Config();
