const winston = require('winston');
const config = require('./config');

const logger = winston.createLogger({
    level: config.app.log_level,
    format: winston.format.combine(
        winston.format.errors({ stack: true }),
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.ms(),
        winston.format.printf(({ level, message, timestamp, label, ms, stack, ...meta }) => {
            const prefix = label ? `[${label}] ` : '';
            let logMsg = `${timestamp} ${ms} ${prefix}[${level.toUpperCase()}]: ${stack || message}`;

            const splat = meta[Symbol.for('splat')];
            if (splat && splat.length) {
                splat.forEach(arg => {
                    if (arg instanceof Error) {
                        logMsg += `\n${arg.stack}`;
                    } else if (typeof arg === 'object') {
                        logMsg += ` ${JSON.stringify(arg)}`;
                    } else {
                        logMsg += ` ${arg}`;
                    }
                });
            }
            return logMsg;
        })
    ),
    transports: [
        new winston.transports.Console()
    ]
});

module.exports = logger;
