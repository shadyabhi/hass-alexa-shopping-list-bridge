const winston = require('winston');
const config = require('./config');

const logger = winston.createLogger({
    level: config.app.log_level,
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.ms(),
        winston.format.printf(({ level, message, timestamp, label, ms }) => {
            const prefix = label ? `[${label}] ` : '';
            return `${timestamp} ${ms} ${prefix}[${level.toUpperCase()}]: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console()
    ]
});

module.exports = logger;
