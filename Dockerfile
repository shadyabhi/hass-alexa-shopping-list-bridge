FROM mcr.microsoft.com/playwright:v1.58.2-jammy

# Coupling: Entry point expected via Home Assistant Addon system
COPY run.sh /run.sh
RUN chmod a+x /run.sh

WORKDIR /app
COPY . .

RUN npm ci

CMD [ "/run.sh" ]
